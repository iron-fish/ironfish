/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

//! View keys allow your transactions to be read
//! by a third party without giving the option to spend your
//! coins. This was designed for auditing systems, but may have other purposes
//! such as in the use of light clients.
//!
//! There are two kinds of view keys. One allows you to share transactions
//! that you have received, while the other allows you to share transactions
//! that you have spent.
//!

use super::{errors, PublicAddress, Sapling};
use crate::serializing::{
    bytes_to_hex, hex_to_bytes, point_to_bytes, read_scalar, scalar_to_bytes,
};
use bip39::{Language, Mnemonic};
use blake2b_simd::Params as Blake2b;
use rand::{thread_rng, Rng};

use std::{io, sync::Arc};
use zcash_primitives::jubjub::{edwards, JubjubEngine, PrimeOrder};

const DIFFIE_HELLMAN_PERSONALIZATION: &[u8; 16] = b"Beanstalk shared";

/// Key that allows someone to view a transaction that you have received.
///
/// Referred to as `ivk` in the literature.
#[derive(Clone)]
pub struct IncomingViewKey<J: JubjubEngine + pairing::MultiMillerLoop> {
    pub(crate) sapling: Arc<Sapling<J>>,
    pub(crate) view_key: J::Fs,
}

impl<J: JubjubEngine + pairing::MultiMillerLoop> IncomingViewKey<J> {
    /// load view key from a Read implementation
    pub fn read<R: io::Read>(
        sapling: Arc<Sapling<J>>,
        reader: &mut R,
    ) -> Result<Self, errors::SaplingKeyError> {
        let view_key = read_scalar(reader)?;
        Ok(IncomingViewKey { sapling, view_key })
    }

    /// Load a key from a string of hexadecimal digits
    pub fn from_hex(
        sapling: Arc<Sapling<J>>,
        value: &str,
    ) -> Result<Self, errors::SaplingKeyError> {
        match hex_to_bytes(value) {
            Err(()) => Err(errors::SaplingKeyError::InvalidViewingKey),
            Ok(bytes) => {
                if bytes.len() != 32 {
                    Err(errors::SaplingKeyError::InvalidViewingKey)
                } else {
                    Self::read(sapling, &mut bytes[..].as_ref())
                }
            }
        }
    }

    /// Load a key from a string of words to be decoded into bytes.
    ///
    /// See https://github.com/BeanstalkNetwork/word-encoding
    pub fn from_words(
        sapling: Arc<Sapling<J>>,
        language_code: &str,
        value: String,
    ) -> Result<Self, errors::SaplingKeyError> {
        let language = Language::from_language_code(language_code)
            .ok_or(errors::SaplingKeyError::InvalidLanguageEncoding)?;
        let mnemonic = Mnemonic::from_phrase(&value, language)
            .map_err(|_| errors::SaplingKeyError::InvalidPaymentAddress)?;
        let bytes = mnemonic.entropy();
        let mut byte_arr = [0; 32];
        byte_arr.clone_from_slice(&bytes[0..32]);
        Self::read(sapling, &mut byte_arr[..].as_ref())
    }

    /// Viewing key as hexadecimal, for readability.
    pub fn hex_key(&self) -> String {
        bytes_to_hex(&scalar_to_bytes(&self.view_key))
    }

    /// Even more readable
    pub fn words_key(&self, language_code: &str) -> Result<String, errors::SaplingKeyError> {
        let language = Language::from_language_code(language_code)
            .ok_or(errors::SaplingKeyError::InvalidLanguageEncoding)?;
        let mnemonic = Mnemonic::from_entropy(&scalar_to_bytes(&self.view_key), language).unwrap();
        Ok(mnemonic.phrase().to_string())
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
    ) -> Result<PublicAddress<J>, errors::SaplingKeyError> {
        PublicAddress::from_view_key(self, diversifier)
    }

    /// Generate a public address from this key,
    /// picking a diversifier that is guaranteed to work with it.
    ///
    /// This method always succeeds, retrying with a different diversifier if
    /// one doesn't work.
    pub fn generate_public_address(&self) -> PublicAddress<J> {
        let public_address;
        loop {
            let mut diversifier_candidate = [0u8; 11];
            thread_rng().fill(&mut diversifier_candidate);

            if let Ok(key) = self.public_address(&diversifier_candidate) {
                public_address = key;
                break;
            }
        }
        public_address
    }

    /// Calculate the shared secret key given the ephemeral public key that was
    /// created for a transaction.
    pub(crate) fn shared_secret(
        &self,
        ephemeral_public_key: &edwards::Point<J, PrimeOrder>,
    ) -> [u8; 32] {
        shared_secret(
            &self.sapling.jubjub,
            &self.view_key,
            ephemeral_public_key,
            ephemeral_public_key,
        )
    }
}

/// Key that allows someone to view a transaction that you have spent.
///
/// Referred to as `ovk` in the literature.
#[derive(Clone)]
pub struct OutgoingViewKey<J: JubjubEngine + pairing::MultiMillerLoop> {
    pub(crate) sapling: Arc<Sapling<J>>,
    pub(crate) view_key: [u8; 32],
}

impl<J: JubjubEngine + pairing::MultiMillerLoop> OutgoingViewKey<J> {
    /// Load a key from a string of hexadecimal digits
    pub fn from_hex(
        sapling: Arc<Sapling<J>>,
        value: &str,
    ) -> Result<Self, errors::SaplingKeyError> {
        match hex_to_bytes(value) {
            Err(()) => Err(errors::SaplingKeyError::InvalidViewingKey),
            Ok(bytes) => {
                if bytes.len() != 32 {
                    Err(errors::SaplingKeyError::InvalidViewingKey)
                } else {
                    let mut view_key = [0; 32];
                    view_key.clone_from_slice(&bytes[0..32]);
                    Ok(Self { sapling, view_key })
                }
            }
        }
    }

    /// Load a key from a string of words to be decoded into bytes.
    ///
    /// See https://github.com/BeanstalkNetwork/word-encoding
    pub fn from_words(
        sapling: Arc<Sapling<J>>,
        language_code: &str,
        value: String,
    ) -> Result<Self, errors::SaplingKeyError> {
        let language = Language::from_language_code(language_code)
            .ok_or(errors::SaplingKeyError::InvalidLanguageEncoding)?;
        let mnemonic = Mnemonic::from_phrase(&value, language)
            .map_err(|_| errors::SaplingKeyError::InvalidPaymentAddress)?;
        let bytes = mnemonic.entropy();
        let mut view_key = [0; 32];
        view_key.clone_from_slice(&bytes[0..32]);
        Ok(Self { sapling, view_key })
    }

    /// Viewing key as hexadecimal, for readability.
    pub fn hex_key(&self) -> String {
        bytes_to_hex(&self.view_key)
    }

    /// Even more readable
    pub fn words_key(&self, language_code: &str) -> Result<String, errors::SaplingKeyError> {
        let language = Language::from_language_code(language_code)
            .ok_or(errors::SaplingKeyError::InvalidLanguageEncoding)?;
        let mnemonic = Mnemonic::from_entropy(&self.view_key, language).unwrap();
        Ok(mnemonic.phrase().to_string())
    }
}

/// Pair of outgoing and incoming view keys for a complete audit
/// of spends and receipts
#[derive(Clone)]
pub struct ViewKeys<J: JubjubEngine + pairing::MultiMillerLoop> {
    pub incoming: IncomingViewKey<J>,
    pub outgoing: OutgoingViewKey<J>,
}

/// Derive a shared secret key from a secret key and the other person's public
/// key.
///
///
/// The shared secret point is calculated by multiplying the public and private
/// keys. This gets converted to bytes and hashed together with the reference
/// public key to generate the final shared secret as used in encryption.

/// A Diffie Hellman key exchange might look like this:
///  *  alice generates her DH secret key as SaplingKeys::internal_viewing_key
///  *  alice chooses a diversifier and publishes it and the transmission key
///     generated from it as a PublicAddress
///      *  The transmission key becomes her DH public_key
///  *  Bob chooses some randomness as his secret key using the
///     generate_diffie_hellman_keys method on alice's PublicAddress
///  *  That method calculates bob's public key as (alice diversifier * bob secret key)
///      *  This public key becomes the reference public key for both sides
///      *  bob sends public key to Alice
///  *  bob calculates shared secret key as (alice public key * bob secret key)
///      *  which is (alice transmission key * bob secret key)
///      *  maths to (alice internal viewing key * diversifier * bob secret key)
///  *  alice calculates shared secret key as (bob public key * alice internal viewing key)
///      *  this maths to (alice diversifier * bob secret key * alice internal viewing key)
///  *  both alice and bob hash the shared secret key with the reference public
///     key (bob's public key) to get the final shared secret
///
/// The resulting key can be used in any symmetric cipher
pub(crate) fn shared_secret<J: JubjubEngine + pairing::MultiMillerLoop>(
    jubjub: &J::Params,
    secret_key: &J::Fs,
    other_public_key: &edwards::Point<J, PrimeOrder>,
    reference_public_key: &edwards::Point<J, PrimeOrder>,
) -> [u8; 32] {
    let shared_secret = point_to_bytes(&other_public_key.mul(*secret_key, jubjub))
        .expect("should be able to convert point to bytes");
    let reference_bytes =
        point_to_bytes(reference_public_key).expect("should be able to convert point to bytes");

    let mut hasher = Blake2b::new()
        .hash_length(32)
        .personal(DIFFIE_HELLMAN_PERSONALIZATION)
        .to_state();

    hasher.update(&shared_secret);
    hasher.update(&reference_bytes);
    let mut hash_result = [0; 32];
    hash_result[..].clone_from_slice(hasher.finalize().as_ref());
    hash_result
}
