/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use super::errors;
use super::serializing::{
    bytes_to_hex, hex_to_bytes, point_to_bytes, read_scalar, scalar_to_bytes,
};
use bip39::{Language, Mnemonic};
use blake2b_simd::Params as Blake2b;
use blake2s_simd::Params as Blake2s;
use group::GroupEncoding;
use jubjub::SubgroupPoint;
use rand::prelude::*;
// use rand_core::{OsRng, RngCore};
use zcash_primitives::constants::{
    CRH_IVK_PERSONALIZATION, PROOF_GENERATION_KEY_GENERATOR, SPENDING_KEY_GENERATOR,
};
use zcash_primitives::primitives::{ProofGenerationKey, ViewingKey};

use std::io;

mod public_address;
pub use public_address::*;
mod view_keys;
pub use view_keys::*;

#[cfg(test)]
mod test;

const EXPANDED_SPEND_BLAKE2_KEY: &[u8; 16] = b"Beanstalk Money ";

/// A single private key generates multiple other key parts that can
/// be used to allow various forms of access to a commitment note:
///
/// While the key parts are all represented as 256 bit keys to the outside
/// world, inside the API they map to Edwards points or scalar values
/// on the JubJub curve.
#[derive(Clone)]
pub struct SaplingKey {
    /// The private (secret) key from which all the other key parts are derived.
    /// The expanded form of this key is required before a note can be spent.
    spending_key: [u8; 32],

    /// Part of the expanded form of the spending key, generally referred to as
    /// `ask` in the literature. Derived from spending key using a seeded
    /// pseudorandom hash function. Used to construct authorizing_key.
    pub(crate) spend_authorizing_key: jubjub::Fr,

    /// Part of the expanded form of the spending key, generally referred to as
    /// `nsk` in the literature. Derived from spending key using a seeded
    /// pseudorandom hash function. Used to construct nullifier_deriving_key
    pub(crate) proof_authorizing_key: jubjub::Fr,

    /// Part of the expanded form of the spending key, as well as being used
    /// directly in the full viewing key. Generally referred to as
    /// `ovk` in the literature. Derived from spending key using a seeded
    /// pseudorandom hash function. This allows the creator of a note to access
    /// keys needed to decrypt the note's contents.
    pub(crate) outgoing_viewing_key: OutgoingViewKey,

    /// Part of the full viewing key. Generally referred to as
    /// `ak` in the literature. Derived from spend_authorizing_key using scalar
    /// multiplication in Sapling. Used to construct incoming viewing key.
    pub(crate) authorizing_key: SubgroupPoint,

    /// Part of the full viewing key. Generally referred to as
    /// `nk` in the literature. Derived from proof_authorizing_key using scalar
    /// multiplication. Used to construct incoming viewing key.
    pub(crate) nullifier_deriving_key: SubgroupPoint,

    /// Part of the payment_address. Generally referred to as
    /// `ivk` in the literature. Derived from authorizing key and
    /// nullifier deriving key. Used to construct payment address and
    /// transmission key. This key allows the receiver of a note to decrypt its
    /// contents.
    pub(crate) incoming_viewing_key: IncomingViewKey,
}

impl<'a> SaplingKey {
    /// Construct a new key from an array of bytes
    pub fn new(spending_key: [u8; 32]) -> Result<Self, errors::SaplingKeyError> {
        let spend_authorizing_key =
            jubjub::Fr::from_bytes_wide(&Self::convert_key(spending_key, 0));
        let proof_authorizing_key =
            jubjub::Fr::from_bytes_wide(&Self::convert_key(spending_key, 1));
        let mut outgoing_viewing_key = [0; 32];
        outgoing_viewing_key[0..32].clone_from_slice(&Self::convert_key(spending_key, 2)[0..32]);
        let outgoing_viewing_key = OutgoingViewKey {
            view_key: outgoing_viewing_key,
        };
        let authorizing_key = SPENDING_KEY_GENERATOR * spend_authorizing_key;
        let nullifier_deriving_key = PROOF_GENERATION_KEY_GENERATOR * proof_authorizing_key;
        let incoming_viewing_key = IncomingViewKey {
            view_key: Self::hash_viewing_key(&authorizing_key, &nullifier_deriving_key)?,
        };

        Ok(SaplingKey {
            spending_key,
            spend_authorizing_key,
            proof_authorizing_key,
            outgoing_viewing_key,
            authorizing_key,
            nullifier_deriving_key,
            incoming_viewing_key,
        })
    }

    /// Load a new key from a Read implementation (e.g: socket, file)
    pub fn read<R: io::Read>(reader: &mut R) -> Result<Self, errors::SaplingKeyError> {
        let mut spending_key = [0; 32];
        reader.read_exact(&mut spending_key)?;
        Self::new(spending_key)
    }

    /// Load a key from a string of hexadecimal digits
    pub fn from_hex(value: &str) -> Result<Self, errors::SaplingKeyError> {
        match hex_to_bytes(value) {
            Err(()) => Err(errors::SaplingKeyError::InvalidPaymentAddress),
            Ok(bytes) => {
                if bytes.len() != 32 {
                    Err(errors::SaplingKeyError::InvalidPaymentAddress)
                } else {
                    let mut byte_arr = [0; 32];
                    byte_arr.clone_from_slice(&bytes[0..32]);
                    Self::new(byte_arr)
                }
            }
        }
    }

    /// Load a key from a string of words to be decoded into bytes.
    pub fn from_words(language_code: &str, value: String) -> Result<Self, errors::SaplingKeyError> {
        let language = Language::from_language_code(language_code)
            .ok_or(errors::SaplingKeyError::InvalidLanguageEncoding)?;
        let mnemonic = Mnemonic::from_phrase(&value, language)
            .map_err(|_| errors::SaplingKeyError::InvalidPaymentAddress)?;
        let bytes = mnemonic.entropy();
        let mut byte_arr = [0; 32];
        byte_arr.clone_from_slice(&bytes[0..32]);
        Self::new(byte_arr)
    }

    /// Generate a new random secret key.
    ///
    /// This would normally be used for a new account coming online for the
    /// first time.
    /// Note that unlike `new`, this function always successfully returns a value.
    pub fn generate_key() -> Self {
        let spending_key: [u8; 32] = random();
        // OsRng.fill_bytes(&mut spending_key);
        loop {
            if let Ok(key) = Self::new(spending_key) {
                return key;
            }
        }
    }

    /// Generate a public address from the incoming viewing key, given a specific
    /// 11 byte diversifier.
    ///
    /// This may fail, as not all diversifiers are created equal.
    ///
    /// Note: This may need to be public at some point. I'm hoping the client
    /// API would never have to deal with diversifiers, but I'm not sure, yet.
    pub fn public_address(
        &self,
        diversifier: &[u8; 11],
    ) -> Result<PublicAddress, errors::SaplingKeyError> {
        PublicAddress::from_key(self, diversifier)
    }

    /// Generate a public address from this key's incoming viewing key,
    /// picking a diversifier that is guaranteed to work with it.
    ///
    /// This method always succeeds, retrying with a different diversifier if
    /// one doesn't work
    pub fn generate_public_address(&self) -> PublicAddress {
        self.incoming_viewing_key.generate_public_address()
    }

    // Write a bytes representation of this key to the provided stream
    pub fn write<W: io::Write>(&self, mut writer: W) -> io::Result<()> {
        let num_bytes_written = writer.write(&self.spending_key)?;
        if num_bytes_written != 32 {
            Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "Couldn't write entire key",
            ))
        } else {
            Ok(())
        }
    }

    /// Retrieve the private spending key
    pub fn spending_key(&self) -> [u8; 32] {
        self.spending_key
    }

    /// Private spending key as hexadecimal. This is slightly
    /// more human readable.
    pub fn hex_spending_key(&self) -> String {
        bytes_to_hex(&self.spending_key)
    }

    /// Private spending key as words. This is even more human readable.
    ///
    /// We abuse the bip-39 to directly encode the key as words, instead of as
    /// a seed. This isn't strictly necessary for private key, but view keys
    /// will need a direct mapping. The private key could still be generated
    /// using bip-32 and bip-39 if desired.
    pub fn words_spending_key(
        &self,
        language_code: &str,
    ) -> Result<String, errors::SaplingKeyError> {
        let language = Language::from_language_code(language_code)
            .ok_or(errors::SaplingKeyError::InvalidLanguageEncoding)?;
        let mnemonic = Mnemonic::from_entropy(&self.spending_key, language).unwrap();
        Ok(mnemonic.phrase().to_string())
    }

    /// Retrieve the publicly visible outgoing viewing key
    pub fn outgoing_view_key(&self) -> &OutgoingViewKey {
        &self.outgoing_viewing_key
    }

    /// Retrieve the publicly visible incoming viewing key
    pub fn incoming_view_key(&self) -> &IncomingViewKey {
        &self.incoming_viewing_key
    }

    /// Retrieve both the view keys. These would normally used for third-party audits
    /// or for light clients.
    pub fn view_keys(&self) -> ViewKeys {
        ViewKeys {
            incoming: self.incoming_view_key().clone(),
            outgoing: self.outgoing_view_key().clone(),
        }
    }

    #[deprecated(note = "I'm not aware that this ever needs to be publicly visible")]
    /// Retrieve the spend authorizing key
    pub fn spend_authorizing_key(&self) -> [u8; 32] {
        scalar_to_bytes(&self.spend_authorizing_key)
    }

    #[deprecated(note = "I'm not aware that this ever needs to be publicly visible")]
    /// Retrieve the byte representation of the proof authorizing key
    pub fn proof_authorizing_key(&self) -> [u8; 32] {
        scalar_to_bytes(&self.proof_authorizing_key)
    }

    #[deprecated(note = "I'm not aware that this ever needs to be publicly visible")]
    /// Retrieve the byte representation of the authorizing key
    pub fn authorizing_key(&self) -> [u8; 32] {
        point_to_bytes(&self.authorizing_key)
            .expect("authorizing key should be convertible to bytes")
    }

    #[deprecated(note = "I'm not aware that this ever needs to be publicly visible")]
    /// Retrieve the byte representation of the nullifier_deriving_key
    pub fn nullifier_deriving_key(&self) -> [u8; 32] {
        point_to_bytes(&self.nullifier_deriving_key)
            .expect("nullifier deriving key should be convertible to bytes")
    }

    /// Adapter to convert this key to a viewing key for use in sapling
    /// functions.
    pub(crate) fn sapling_viewing_key(&self) -> ViewingKey {
        ViewingKey {
            ak: self.authorizing_key,
            nk: self.nullifier_deriving_key,
        }
    }

    /// Adapter to convert this key to a proof generation key for use in
    /// sapling functions
    pub(crate) fn sapling_proof_generation_key(&self) -> ProofGenerationKey {
        ProofGenerationKey {
            ak: self.authorizing_key,
            nsk: self.proof_authorizing_key,
        }
    }

    /// Convert the spending key to another value using a pseudorandom hash
    /// function. Used during key construction to derive the following keys:
    ///  *  `spend_authorizing_key` (represents a sapling scalar Fs type)
    ///  *  `proof_authorizing_key` (represents a sapling scalar Fs type)
    ///  *  `outgoing_viewing_key (just some bytes)
    ///
    /// # Arguments
    ///  *  `spending_key` The 32 byte spending key
    ///  *  `modifier` a byte to add to tweak the hash for each of the three
    ///     values
    fn convert_key(spending_key: [u8; 32], modifier: u8) -> [u8; 64] {
        let mut hasher = Blake2b::new()
            .hash_length(64)
            .personal(EXPANDED_SPEND_BLAKE2_KEY)
            .to_state();

        hasher.update(&spending_key);
        hasher.update(&[modifier]);
        let mut hash_result = [0; 64];
        hash_result[0..64].clone_from_slice(&hasher.finalize().as_ref()[0..64]);
        hash_result
    }

    /// Helper method to construct the viewing key from the authorizing key
    /// and nullifier deriving key using a blake2 hash of their respective bytes.
    ///
    /// This method is only called once, but it's kind of messy, so I pulled it
    /// out of the constructor for easier maintenance.
    fn hash_viewing_key(
        authorizing_key: &SubgroupPoint,
        nullifier_deriving_key: &SubgroupPoint,
    ) -> Result<jubjub::Fr, errors::SaplingKeyError> {
        let mut view_key_contents = [0; 64];
        view_key_contents[0..32].copy_from_slice(&authorizing_key.to_bytes());
        view_key_contents[32..64].copy_from_slice(&nullifier_deriving_key.to_bytes());
        // let mut hasher = Blake2s::with_params(32, &[], &[], CRH_IVK_PERSONALIZATION);

        let mut hash_result = [0; 32];
        hash_result.copy_from_slice(
            Blake2s::new()
                .hash_length(32)
                .personal(CRH_IVK_PERSONALIZATION)
                .hash(&view_key_contents)
                .as_bytes(),
        );
        // Drop the last five bits, so it can be interpreted as a scalar.
        hash_result[31] &= 0b0000_0111;
        if hash_result == [0; 32] {
            return Err(errors::SaplingKeyError::InvalidViewingKey);
        }
        let scalar = read_scalar(&hash_result[..])?;
        Ok(scalar)
    }
}
