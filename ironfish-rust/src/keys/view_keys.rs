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

use super::PublicAddress;
use crate::{
    errors::{IronfishError, IronfishErrorKind},
    serializing::{bytes_to_hex, hex_to_bytes, read_scalar},
};
use bip39::{Language, Mnemonic};
use blake2b_simd::Params as Blake2b;
use group::GroupEncoding;
use jubjub::SubgroupPoint;

use std::io;

const DIFFIE_HELLMAN_PERSONALIZATION: &[u8; 16] = b"Iron Fish shared";

/// Key that allows someone to view a transaction that you have received.
///
/// Referred to as `ivk` in the literature.
#[derive(Clone)]
pub struct IncomingViewKey {
    pub(crate) view_key: jubjub::Fr,
}

impl IncomingViewKey {
    /// load view key from a Read implementation
    pub fn read<R: io::Read>(reader: &mut R) -> Result<Self, IronfishError> {
        let view_key = read_scalar(reader)?;
        Ok(IncomingViewKey { view_key })
    }

    /// Load a key from a string of hexadecimal digits
    pub fn from_hex(value: &str) -> Result<Self, IronfishError> {
        match hex_to_bytes::<32>(value) {
            Err(_) => Err(IronfishError::new(IronfishErrorKind::InvalidViewingKey)),
            Ok(bytes) => Self::read(&mut bytes.as_ref()),
        }
    }

    /// Load a key from a string of words to be decoded into bytes.
    pub fn from_words(language_code: &str, value: String) -> Result<Self, IronfishError> {
        let language = Language::from_language_code(language_code)
            .ok_or_else(|| IronfishError::new(IronfishErrorKind::InvalidLanguageEncoding))?;
        let mnemonic = Mnemonic::from_phrase(&value, language)
            .map_err(|_| IronfishError::new(IronfishErrorKind::InvalidPaymentAddress))?;
        let bytes = mnemonic.entropy();
        let mut byte_arr = [0; 32];
        byte_arr.clone_from_slice(&bytes[0..32]);
        Self::read(&mut byte_arr[..].as_ref())
    }

    /// Viewing key as hexadecimal, for readability.
    pub fn hex_key(&self) -> String {
        bytes_to_hex(&self.view_key.to_bytes())
    }

    /// Even more readable
    pub fn words_key(&self, language_code: &str) -> Result<String, IronfishError> {
        let language = Language::from_language_code(language_code)
            .ok_or_else(|| IronfishError::new(IronfishErrorKind::InvalidLanguageEncoding))?;
        let mnemonic = Mnemonic::from_entropy(&self.view_key.to_bytes(), language).unwrap();
        Ok(mnemonic.phrase().to_string())
    }

    /// Generate a public address from the incoming viewing key
    pub fn public_address(&self) -> PublicAddress {
        PublicAddress::from_view_key(self)
    }

    /// Calculate the shared secret key given the ephemeral public key that was
    /// created for a transaction.
    pub(crate) fn shared_secret(&self, ephemeral_public_key: &SubgroupPoint) -> [u8; 32] {
        shared_secret(&self.view_key, ephemeral_public_key, ephemeral_public_key)
    }
}

/// Contains two keys that are required (along with outgoing view key)
/// to have full view access to an account.
/// Referred to as `ViewingKey` in the literature.
#[derive(Clone)]
pub struct ViewKey {
    /// Part of the full viewing key. Generally referred to as
    /// `ak` in the literature. Derived from spend_authorizing_key using scalar
    /// multiplication in Sapling. Used to construct incoming viewing key.
    pub authorizing_key: jubjub::SubgroupPoint,
    /// Part of the full viewing key. Generally referred to as
    /// `nk` in the literature. Derived from proof_authorizing_key using scalar
    /// multiplication. Used to construct incoming viewing key.
    pub nullifier_deriving_key: jubjub::SubgroupPoint,
}

impl ViewKey {
    /// Load a key from a string of hexadecimal digits
    pub fn from_hex(value: &str) -> Result<Self, IronfishError> {
        let bytes: [u8; 64] = hex_to_bytes(value)?;

        let mut authorizing_key_bytes = [0; 32];
        let mut nullifier_deriving_key_bytes = [0; 32];

        authorizing_key_bytes.clone_from_slice(&bytes[..32]);
        nullifier_deriving_key_bytes.clone_from_slice(&bytes[32..]);

        let authorizing_key = Option::from(SubgroupPoint::from_bytes(&authorizing_key_bytes))
            .ok_or_else(|| IronfishError::new(IronfishErrorKind::InvalidAuthorizingKey))?;
        let nullifier_deriving_key = Option::from(SubgroupPoint::from_bytes(
            &nullifier_deriving_key_bytes,
        ))
        .ok_or_else(|| IronfishError::new(IronfishErrorKind::InvalidNullifierDerivingKey))?;

        Ok(Self {
            authorizing_key,
            nullifier_deriving_key,
        })
    }

    /// Viewing key as hexadecimal, for readability.
    pub fn hex_key(&self) -> String {
        bytes_to_hex(&self.to_bytes())
    }

    pub fn to_bytes(&self) -> [u8; 64] {
        let mut result = [0; 64];
        result[..32].copy_from_slice(&self.authorizing_key.to_bytes());
        result[32..].copy_from_slice(&self.nullifier_deriving_key.to_bytes());
        result
    }
}

/// Key that allows someone to view a transaction that you have spent.
///
/// Referred to as `ovk` in the literature.
#[derive(Clone)]
pub struct OutgoingViewKey {
    pub(crate) view_key: [u8; 32],
}

impl OutgoingViewKey {
    /// Load a key from a string of hexadecimal digits
    pub fn from_hex(value: &str) -> Result<Self, IronfishError> {
        match hex_to_bytes(value) {
            Err(_) => Err(IronfishError::new(IronfishErrorKind::InvalidViewingKey)),
            Ok(bytes) => Ok(Self { view_key: bytes }),
        }
    }

    /// Load a key from a string of words to be decoded into bytes.
    pub fn from_words(language_code: &str, value: String) -> Result<Self, IronfishError> {
        let language = Language::from_language_code(language_code)
            .ok_or_else(|| IronfishError::new(IronfishErrorKind::InvalidLanguageEncoding))?;
        let mnemonic = Mnemonic::from_phrase(&value, language)
            .map_err(|_| IronfishError::new(IronfishErrorKind::InvalidPaymentAddress))?;
        let bytes = mnemonic.entropy();
        let mut view_key = [0; 32];
        view_key.clone_from_slice(&bytes[0..32]);
        Ok(Self { view_key })
    }

    /// Viewing key as hexadecimal, for readability.
    pub fn hex_key(&self) -> String {
        bytes_to_hex(&self.view_key)
    }

    /// Even more readable
    pub fn words_key(&self, language_code: &str) -> Result<String, IronfishError> {
        let language = Language::from_language_code(language_code)
            .ok_or_else(|| IronfishError::new(IronfishErrorKind::InvalidLanguageEncoding))?;
        let mnemonic = Mnemonic::from_entropy(&self.view_key, language).unwrap();
        Ok(mnemonic.phrase().to_string())
    }
}

/// Derive a shared secret key from a secret key and the other person's public
/// key.
///
/// The shared secret point is calculated by multiplying the public and private
/// keys. This gets converted to bytes and hashed together with the reference
/// public key to generate the final shared secret as used in encryption.

/// A Diffie Hellman key exchange might look like this:
///  *  Alice generates her DH secret key as SaplingKeys::internal_viewing_key
///  *  Alice publishes her Public key
///      *  This becomes her DH public_key
///  *  Bob chooses some randomness as his secret key
///  *  Bob's public key is calculated as (PUBLIC_KEY_GENERATOR * Bob secret key)
///      *  This public key becomes the reference public key for both sides
///      *  Bob sends public key to Alice
///  *  Bob calculates shared secret key as (Alice public key * Bob secret key)
///      *  which is (Alice public key * Bob secret key)
///      *  which is equivalent to (Alice internal viewing key * PUBLIC_KEY_GENERATOR * Bob secret key)
///  *  Alice calculates shared secret key as (Bob public key * Alice internal viewing key)
///      *  which is equivalent to (Alice internal viewing key * PUBLIC_KEY_GENERATOR * Bob secret key)
///  *  both Alice and Bob hash the shared secret key with the reference public
///     key (Bob's public key) to get the final shared secret
///
/// The resulting key can be used in any symmetric cipher
pub(crate) fn shared_secret(
    secret_key: &jubjub::Fr,
    other_public_key: &SubgroupPoint,
    reference_public_key: &SubgroupPoint,
) -> [u8; 32] {
    let shared_secret = (other_public_key * secret_key).to_bytes();
    let reference_bytes = reference_public_key.to_bytes();

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

#[cfg(test)]
mod test {
    use crate::{SaplingKey, ViewKey};

    #[test]
    fn test_view_key() {
        let key = SaplingKey::from_hex(
            "d96dc74bbca05dffb14a5631024588364b0cc9f583b5c11908b6ea98a2b778f7",
        )
        .expect("Key should be generated");
        let view_key_hex = key.view_key.hex_key();
        assert_eq!(view_key_hex, "498b5103a72c41237c3f2bca96f20100f5a3a8a17c6b8366a485fd16e8931a5d2ff2eb8f991032c815414ff0ae2d8bc3ea3b56bffc481db3f28e800050244463");

        let recreated_key =
            ViewKey::from_hex(&view_key_hex).expect("Key should be created from hex");
        assert_eq!(key.view_key.authorizing_key, recreated_key.authorizing_key);
        assert_eq!(
            key.view_key.nullifier_deriving_key,
            recreated_key.nullifier_deriving_key
        );
    }
}
