/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::serializing::{bytes_to_hex, hex_to_bytes, point_to_bytes};
use group::GroupEncoding;
use jubjub::SubgroupPoint;
use rand::{thread_rng, Rng};
use zcash_primitives::primitives::{Diversifier, PaymentAddress};

use std::{convert::TryInto, io};

use super::{errors, IncomingViewKey, SaplingKey};

/// The address to which funds can be sent, stored as a diversifier and public
/// transmission key. Combining a diversifier with an incoming_viewing_key allows
/// the creation of multiple public addresses without revealing the viewing key.
/// This allows the user to have multiple "accounts", or to even have different
/// payment addresses per transaction.
#[derive(Clone)]
pub struct PublicAddress {
    /// Diversifier is a struct of 11 bytes. The array is hashed and interpreted
    /// as an edwards point, but we have to store the diversifier independently
    /// because the pre-hashed bytes cannot be extracted from the point.
    pub(crate) diversifier: Diversifier,

    /// The same diversifier, but represented as a point on the jubjub curve.
    /// Often referred to as
    /// `g_d` in the literature.
    pub(crate) diversifier_point: SubgroupPoint,

    /// The transmission key is the result of combining the diversifier with the
    /// incoming viewing key (a non-reversible operation). Together, the two
    /// form a public address to which payments can be sent.
    pub(crate) transmission_key: SubgroupPoint,
}

impl PublicAddress {
    /// Initialize a public address from its 43 byte representation.
    pub fn new(address_bytes: &[u8; 43]) -> Result<PublicAddress, errors::SaplingKeyError> {
        let (diversifier, diversifier_point) =
            PublicAddress::load_diversifier(&address_bytes[..11])?;
        let transmission_key = PublicAddress::load_transmission_key(&address_bytes[11..])?;

        Ok(PublicAddress {
            diversifier,
            diversifier_point,
            transmission_key,
        })
    }

    /// Load a public address from a Read implementation (e.g: socket, file)
    pub fn read<R: io::Read>(reader: &mut R) -> Result<Self, errors::SaplingKeyError> {
        let mut address_bytes = [0; 43];
        reader.read_exact(&mut address_bytes)?;
        Self::new(&address_bytes)
    }

    /// Initialize a public address from a sapling key and the bytes
    /// representing a diversifier. Typically constructed from
    /// SaplingKey::public_address()
    pub fn from_key(
        sapling_key: &SaplingKey,
        diversifier: &[u8; 11],
    ) -> Result<PublicAddress, errors::SaplingKeyError> {
        Self::from_view_key(sapling_key.incoming_view_key(), diversifier)
    }

    pub fn from_view_key(
        view_key: &IncomingViewKey,
        diversifier: &[u8; 11],
    ) -> Result<PublicAddress, errors::SaplingKeyError> {
        let diversifier = Diversifier(*diversifier);
        if let Some(key_part) = diversifier.g_d() {
            Ok(PublicAddress {
                diversifier,
                diversifier_point: key_part,
                transmission_key: key_part * view_key.view_key,
            })
        } else {
            Err(errors::SaplingKeyError::DiversificationError)
        }
    }

    /// Convert a String of hex values to a PublicAddress. The String must
    /// be 86 hexadecimal characters representing the 43 bytes of an address
    /// or it fails.
    pub fn from_hex(value: &str) -> Result<Self, errors::SaplingKeyError> {
        match hex_to_bytes(value) {
            Err(()) => Err(errors::SaplingKeyError::InvalidPublicAddress),
            Ok(bytes) => {
                if bytes.len() != 43 {
                    Err(errors::SaplingKeyError::InvalidPublicAddress)
                } else {
                    let mut byte_arr = [0; 43];
                    byte_arr.clone_from_slice(&bytes[0..43]);
                    Self::new(&byte_arr)
                }
            }
        }
    }

    /// Retrieve the public address in byte form. It is comprised of the
    /// 11 byte diversifier followed by the 32 byte transmission key.
    pub fn public_address(&self) -> [u8; 43] {
        let mut result = [0; 43];
        result[..11].copy_from_slice(&self.diversifier.0);
        result[11..].copy_from_slice(
            &point_to_bytes(&self.transmission_key)
                .expect("transmission key should be convertible to bytes"),
        );
        result
    }

    /// Retrieve the public address in hex form.
    pub fn hex_public_address(&self) -> String {
        bytes_to_hex(&self.public_address())
    }

    /// Store the bytes of this public address in the given writer.
    pub fn write<W: io::Write>(&self, mut writer: W) -> io::Result<()> {
        writer.write_all(&self.public_address())?;
        Ok(())
    }

    pub(crate) fn load_diversifier(
        diversifier_slice: &[u8],
    ) -> Result<(Diversifier, SubgroupPoint), errors::SaplingKeyError> {
        let mut diversifier_bytes = [0; 11];
        diversifier_bytes.clone_from_slice(diversifier_slice);
        let diversifier = Diversifier(diversifier_bytes);
        let diversifier_point = diversifier
            .g_d()
            .ok_or(errors::SaplingKeyError::DiversificationError)?;
        Ok((diversifier, diversifier_point))
    }

    pub(crate) fn load_transmission_key(
        transmission_key_bytes: &[u8],
    ) -> Result<SubgroupPoint, errors::SaplingKeyError> {
        assert!(transmission_key_bytes.len() == 32);
        let transmission_key_non_prime =
            SubgroupPoint::from_bytes(transmission_key_bytes.try_into().unwrap());

        if transmission_key_non_prime.is_some().into() {
            Ok(transmission_key_non_prime.unwrap())
        } else {
            Err(errors::SaplingKeyError::InvalidPaymentAddress)
        }
    }

    /// Calculate secret key and ephemeral public key for Diffie Hellman
    /// Key exchange as used in note encryption.
    ///
    /// The returned values can be used according to the protocol described in
    /// the module-level shared_secret function
    ///
    /// Returns a tuple of:
    ///  *  the ephemeral secret key as a scalar FS
    ///  *  the ephemeral public key as an edwards point
    pub fn generate_diffie_hellman_keys(&self) -> (jubjub::Fr, SubgroupPoint) {
        let mut buffer = [0u8; 64];
        thread_rng().fill(&mut buffer[..]);

        let secret_key: jubjub::Fr = jubjub::Fr::from_bytes_wide(&buffer);
        let public_key = self.diversifier_point * secret_key;
        (secret_key, public_key)
    }

    /// Convert this key to a payment address for use in the zcash_primitives
    /// crate. This is essentially just an adapter from one struct name to
    /// another because `pk_d` is not a name I want to expose in a public
    /// interface.
    pub(crate) fn sapling_payment_address(&self) -> PaymentAddress {
        PaymentAddress::from_parts(self.diversifier, self.transmission_key)
            .expect("Converting PaymentAddress types shouldn't fail")
    }
}

impl std::fmt::Debug for PublicAddress {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "PublicAddress {}", self.hex_public_address())
    }
}

impl std::cmp::PartialEq for PublicAddress {
    fn eq(&self, other: &Self) -> bool {
        self.hex_public_address() == other.hex_public_address()
    }
}
