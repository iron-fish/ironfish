/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::errors::{IronfishError, IronfishErrorKind};
use crate::serializing::{bytes_to_hex, hex_to_bytes, read_scalar};

pub use bip39::Language;
use bip39::Mnemonic;
use blake2b_simd::Params as Blake2b;
use blake2s_simd::Params as Blake2s;
use group::GroupEncoding;
use ironfish_jubjub::SubgroupPoint;
use ironfish_zkp::constants::{
    CRH_IVK_PERSONALIZATION, PROOF_GENERATION_KEY_GENERATOR, SPENDING_KEY_GENERATOR,
};
pub use ironfish_zkp::ProofGenerationKey;
use rand::prelude::*;

use std::{fmt, io};

mod ephemeral;
pub use ephemeral::EphemeralKeyPair;
mod public_address;
pub use public_address::*;
mod view_keys;
pub use view_keys::*;
mod util;
pub use util::*;

#[cfg(test)]
mod test;

const EXPANDED_SPEND_BLAKE2_KEY: &[u8; 16] = b"Iron Fish Money ";

pub const SPEND_KEY_SIZE: usize = 32;

/// A single private key generates multiple other key parts that can
/// be used to allow various forms of access to a commitment note:
///
/// While the key parts are all represented as 256 bit keys to the outside
/// world, inside the API they map to Edwards points or scalar values
/// on the JubJub curve.
#[derive(Clone, PartialEq, Eq)]
pub struct SaplingKey {
    /// The private (secret) key from which all the other key parts are derived.
    /// The expanded form of this key is required before a note can be spent.
    spending_key: [u8; SPEND_KEY_SIZE],

    /// Part of the expanded form of the spending key, generally referred to as
    /// `ask` in the literature. Derived from spending key using a seeded
    /// pseudorandom hash function. Used to construct authorizing_key.
    pub(crate) spend_authorizing_key: ironfish_jubjub::Fr,

    /// Part of the expanded form of the spending key, generally referred to as
    /// `nsk` in the literature. Derived from spending key using a seeded
    /// pseudorandom hash function. Used to construct nullifier_deriving_key
    pub(crate) proof_authorizing_key: ironfish_jubjub::Fr,

    /// Part of the expanded form of the spending key, as well as being used
    /// directly in the full viewing key. Generally referred to as
    /// `ovk` in the literature. Derived from spending key using a seeded
    /// pseudorandom hash function. This allows the creator of a note to access
    /// keys needed to decrypt the note's contents.
    pub(crate) outgoing_viewing_key: OutgoingViewKey,

    /// Part of the full viewing key. Contains ak/nk from literature, used for deriving nullifiers
    /// and therefore spends
    pub(crate) view_key: ViewKey,

    /// Part of the payment_address. Generally referred to as
    /// `ivk` in the literature. Derived from authorizing key and
    /// nullifier deriving key. Used to construct payment address and
    /// transmission key. This key allows the receiver of a note to decrypt its
    /// contents. Derived from view_key contents, this is materialized for convenience
    pub(crate) incoming_viewing_key: IncomingViewKey,
}

impl SaplingKey {
    /// Construct a new key from an array of bytes
    pub fn new(spending_key: [u8; SPEND_KEY_SIZE]) -> Result<Self, IronfishError> {
        let spend_authorizing_key =
            ironfish_jubjub::Fr::from_bytes_wide(&Self::convert_key(spending_key, 0));

        if spend_authorizing_key == ironfish_jubjub::Fr::zero() {
            return Err(IronfishError::new(IronfishErrorKind::IllegalValue));
        }

        let proof_authorizing_key =
            ironfish_jubjub::Fr::from_bytes_wide(&Self::convert_key(spending_key, 1));

        let mut outgoing_viewing_key = [0; SPEND_KEY_SIZE];
        outgoing_viewing_key[0..SPEND_KEY_SIZE]
            .clone_from_slice(&Self::convert_key(spending_key, 2)[0..SPEND_KEY_SIZE]);
        let outgoing_viewing_key = OutgoingViewKey {
            view_key: outgoing_viewing_key,
        };
        let authorizing_key = *SPENDING_KEY_GENERATOR * spend_authorizing_key;
        let nullifier_deriving_key = *PROOF_GENERATION_KEY_GENERATOR * proof_authorizing_key;
        let view_key = ViewKey {
            authorizing_key,
            nullifier_deriving_key,
        };
        let incoming_viewing_key = IncomingViewKey {
            view_key: Self::hash_viewing_key(&authorizing_key, &nullifier_deriving_key)?,
        };

        Ok(SaplingKey {
            spending_key,
            spend_authorizing_key,
            proof_authorizing_key,
            outgoing_viewing_key,
            view_key,
            incoming_viewing_key,
        })
    }

    /// Load a new key from a Read implementation (e.g: socket, file)
    pub fn read<R: io::Read>(mut reader: R) -> Result<Self, IronfishError> {
        let mut spending_key = [0; SPEND_KEY_SIZE];
        reader.read_exact(&mut spending_key)?;
        Self::new(spending_key)
    }

    /// Load a key from a string of hexadecimal digits
    pub fn from_hex(value: &str) -> Result<Self, IronfishError> {
        match hex_to_bytes(value) {
            Err(_) => Err(IronfishError::new(IronfishErrorKind::InvalidPaymentAddress)),
            Ok(bytes) => Self::new(bytes),
        }
    }

    /// Generate a new random secret key.
    ///
    /// This would normally be used for a new account coming online for the
    /// first time.
    /// Note that unlike `new`, this function always successfully returns a value.
    pub fn generate_key() -> Self {
        loop {
            let spending_key: [u8; SPEND_KEY_SIZE] = random();
            if let Ok(key) = Self::new(spending_key) {
                return key;
            }
        }
    }

    /// Generate a public address from the incoming viewing key
    pub fn public_address(&self) -> PublicAddress {
        PublicAddress::from_key(self)
    }

    // Write a bytes representation of this key to the provided stream
    pub fn write<W: io::Write>(&self, mut writer: W) -> Result<(), IronfishError> {
        let num_bytes_written = writer.write(&self.spending_key)?;
        if num_bytes_written != SPEND_KEY_SIZE {
            return Err(IronfishError::new(IronfishErrorKind::InvalidData));
        }

        Ok(())
    }

    /// Retrieve the private spending key
    pub fn spending_key(&self) -> [u8; SPEND_KEY_SIZE] {
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
    pub fn to_words(&self, language: Language) -> Result<Mnemonic, IronfishError> {
        Mnemonic::from_entropy(&self.spending_key, language)
            .map_err(|_| IronfishError::new(IronfishErrorKind::InvalidEntropy))
    }

    /// Takes a bip-39 phrase as a string and turns it into a SaplingKey instance
    pub fn from_words(words: &str, language: Language) -> Result<Self, IronfishError> {
        let mnemonic = Mnemonic::from_phrase(words, language)
            .map_err(|_| IronfishError::new(IronfishErrorKind::InvalidMnemonicString))?;
        let bytes = mnemonic.entropy();
        let mut byte_arr = [0; SPEND_KEY_SIZE];
        byte_arr.clone_from_slice(&bytes[0..SPEND_KEY_SIZE]);
        Self::new(byte_arr)
    }

    pub fn spend_authorizing_key(&self) -> &ironfish_jubjub::Fr {
        &self.spend_authorizing_key
    }

    pub fn proof_authorizing_key(&self) -> &ironfish_jubjub::Fr {
        &self.proof_authorizing_key
    }

    /// Retrieve the publicly visible outgoing viewing key
    pub fn outgoing_view_key(&self) -> &OutgoingViewKey {
        &self.outgoing_viewing_key
    }

    /// Retrieve the publicly visible incoming viewing key
    pub fn incoming_view_key(&self) -> &IncomingViewKey {
        &self.incoming_viewing_key
    }

    /// Retrieve the publicly visible view key
    pub fn view_key(&self) -> &ViewKey {
        &self.view_key
    }

    /// Adapter to convert this key to a proof generation key for use in
    /// sapling functions
    pub fn sapling_proof_generation_key(&self) -> ProofGenerationKey {
        ProofGenerationKey::new(self.view_key.authorizing_key, self.proof_authorizing_key)
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
    fn convert_key(spending_key: [u8; SPEND_KEY_SIZE], modifier: u8) -> [u8; 64] {
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
    pub fn hash_viewing_key(
        authorizing_key: &SubgroupPoint,
        nullifier_deriving_key: &SubgroupPoint,
    ) -> Result<ironfish_jubjub::Fr, IronfishError> {
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
            return Err(IronfishError::new(IronfishErrorKind::InvalidViewingKey));
        }
        let scalar = read_scalar(&hash_result[..])?;
        Ok(scalar)
    }
}

impl fmt::Debug for SaplingKey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        // Hide all private keys
        f.debug_struct("SaplingKey").finish_non_exhaustive()
    }
}
