/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

//! Methods to sign arbitrary message using Iron Fish keys. Note that this module cannot be used to
//! sign or verify transactions.
//!
//! The signature scheme used is RedDSA on the JubJub curve (RedJubJub). Signatures are produced
//! using the [Incoming View Key](crate::keys::IncomingViewKey) and verified using the [Public
//! Address](crate::keys::PublicAddress).
//!
//! See [`ironfish_rust::transaction`] for methods to sign/verify transactions.
//!
//! # Examples
//!
//! ```
//! use ironfish::keys::SaplingKey;
//! use ironfish::signing::sign_message;
//! use ironfish::signing::verify_message;
//!
//! // Generate keys for signing
//! let secret_key = SaplingKey::generate_key();
//!
//! // Sign a message
//! let message = b"some arbitrary message";
//! let signature = sign_message(&secret_key, message, rand::thread_rng());
//!
//! // Get the keys for verification
//! let public_address = secret_key.public_address();
//!
//! // Verify the signature
//! match verify_message(&public_address, message, &signature) {
//!     Ok(()) => println!("verification succeeded"),
//!     Err(err) => println!("verification failed: {err}"),
//! }
//! ```

use crate::{
    errors::{IronfishError, IronfishErrorKind},
    PublicAddress, SaplingKey,
};
use ironfish_zkp::{
    constants::PUBLIC_KEY_GENERATOR,
    redjubjub::{PrivateKey, PublicKey, Signature},
};
use rand::{CryptoRng, RngCore};
use std::io;

const VERSION: u8 = 0xa7u8;

pub type MessageSignatureBytes = [u8; 65];

#[derive(Copy, Clone, Debug)]
pub struct MessageSignature(Signature);

impl MessageSignature {
    pub fn to_bytes(&self) -> MessageSignatureBytes {
        let mut bytes = [0u8; 65];
        self.write(&mut bytes[..])
            .expect("serializing to an array of the correct size should never fail");
        bytes
    }

    pub fn from_bytes(bytes: &MessageSignatureBytes) -> Self {
        Self::read(&bytes[..])
            .expect("deserializing an array of the correct size should never fail")
    }

    pub fn read<R: io::Read>(mut reader: R) -> Result<Self, IronfishError> {
        let mut version = [0u8; 1];
        reader.read_exact(&mut version)?;
        if version != [VERSION] {
            return Err(IronfishError::new(IronfishErrorKind::Unsupported));
        }

        let signature = Signature::read(reader)?;
        Ok(signature.into())
    }

    pub fn write<W: io::Write>(&self, mut writer: W) -> Result<(), IronfishError> {
        writer.write_all(&[VERSION])?;
        self.0.write(writer)?;
        Ok(())
    }
}

impl AsRef<Signature> for MessageSignature {
    #[inline]
    fn as_ref(&self) -> &Signature {
        &self.0
    }
}

impl From<Signature> for MessageSignature {
    #[inline]
    fn from(signature: Signature) -> Self {
        Self(signature)
    }
}

impl From<MessageSignature> for Signature {
    #[inline]
    fn from(signature: MessageSignature) -> Self {
        signature.0
    }
}

impl From<MessageSignatureBytes> for MessageSignature {
    #[inline]
    fn from(bytes: MessageSignatureBytes) -> Self {
        Self::from_bytes(&bytes)
    }
}

impl From<MessageSignature> for MessageSignatureBytes {
    #[inline]
    fn from(signature: MessageSignature) -> Self {
        signature.to_bytes()
    }
}

fn signing_key(secret_key: &SaplingKey) -> PrivateKey {
    PrivateKey(secret_key.incoming_viewing_key.view_key)
}

fn verification_key(public_address: &PublicAddress) -> PublicKey {
    PublicKey(public_address.0.into())
}

/// Signs a message using the Incoming View Key.
///
/// The signature can be verified with [`verify_message()`] using the [Public
/// Address](crate::keys::PublicAddress).
pub fn sign_message<R: RngCore + CryptoRng>(
    secret_key: &SaplingKey,
    message: &[u8],
    mut rng: R,
) -> MessageSignature {
    signing_key(secret_key)
        .sign(message, &mut rng, *PUBLIC_KEY_GENERATOR)
        .into()
}

/// Verifies a signature produced by [`sign_message()`].
pub fn verify_message(
    public_address: &PublicAddress,
    message: &[u8],
    signature: &MessageSignature,
) -> Result<(), IronfishError> {
    match verification_key(public_address).verify(message, &signature.0, *PUBLIC_KEY_GENERATOR) {
        true => Ok(()),
        false => Err(IronfishError::new(IronfishErrorKind::InvalidSignature)),
    }
}

#[cfg(test)]
mod tests {
    use crate::{
        signing::{sign_message, verify_message, MessageSignature},
        SaplingKey,
    };
    use rand::thread_rng;

    #[test]
    fn roundtrip() {
        let secret_key = SaplingKey::generate_key();
        let public_address = secret_key.public_address();
        let message = b"test message";

        let signature = sign_message(&secret_key, message, thread_rng());
        verify_message(&public_address, message, &signature).expect("verification should pass");
    }

    #[test]
    fn roundtrip_with_serialization() {
        let secret_key = SaplingKey::generate_key();
        let public_address = secret_key.public_address();
        let message = b"test message";

        let signature = sign_message(&secret_key, message, thread_rng());
        let serialized_signature = signature.to_bytes();
        let deserialized_signature = MessageSignature::from_bytes(&serialized_signature);
        verify_message(&public_address, message, &deserialized_signature)
            .expect("verification should pass");
    }

    #[test]
    fn non_determinism() {
        let secret_key = SaplingKey::generate_key();
        let message = b"test message";

        // Sign the same message twice with the same key, and verify that the output is different
        // each time
        let signature1 = sign_message(&secret_key, message, thread_rng());
        let signature2 = sign_message(&secret_key, message, thread_rng());

        assert_ne!(signature1.to_bytes(), signature2.to_bytes());
    }

    #[test]
    fn verify_fails_with_wrong_message() {
        let secret_key = SaplingKey::generate_key();
        let public_address = secret_key.public_address();
        let message = b"test message";

        let signature = sign_message(&secret_key, message, thread_rng());
        let wrong_message = b"another test message";
        verify_message(&public_address, wrong_message, &signature)
            .expect_err("verification should fail");
    }

    #[test]
    fn verify_fails_with_wrong_public_address() {
        let secret_key = SaplingKey::generate_key();
        let message = b"test message";

        let signature = sign_message(&secret_key, message, thread_rng());
        let wrong_public_address = SaplingKey::generate_key().public_address();
        verify_message(&wrong_public_address, message, &signature)
            .expect_err("verification should fail");
    }
}
