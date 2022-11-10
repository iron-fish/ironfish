/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::{
    errors::IronfishError,
    serializing::{bytes_to_hex, hex_to_bytes, point_to_bytes},
};
use ff::Field;
use group::GroupEncoding;
use ironfish_zkp::{Diversifier, PaymentAddress};
use jubjub::SubgroupPoint;
use rand::thread_rng;

use std::{convert::TryInto, io};

use super::{IncomingViewKey, SaplingKey};

/// The generator for public address.
pub const PUBLIC_KEY_GENERATOR: SubgroupPoint = SubgroupPoint::from_raw_unchecked(
    bls12_381::Scalar::from_raw([
        0x3edc_c85f_4d1a_44cd,
        0x77ff_8c90_a9a0_d8f4,
        0x0daf_03b5_47e2_022b,
        0x6dad_65e6_2328_d37a,
    ]),
    bls12_381::Scalar::from_raw([
        0x5095_1f1f_eff0_8278,
        0xf0b7_03d5_3a3e_dd4e,
        0xca01_f580_9c00_eee2,
        0x6996_932c_ece1_f4bb,
    ]),
);

/// The address to which funds can be sent, stored as a public
/// transmission key. Using the incoming_viewing_key allows
/// the creation of a unqiue public addresses without revealing the viewing key.
#[derive(Clone, Copy)]
pub struct PublicAddress {
    /// The transmission key is the result of combining the diversifier with the
    /// incoming viewing key (a non-reversible operation). Together, the two
    /// form a public address to which payments can be sent.
    pub(crate) transmission_key: SubgroupPoint,
}

impl PublicAddress {
    /// Initialize a public address from its 32 byte representation.
    pub fn new(address_bytes: &[u8; 32]) -> Result<PublicAddress, IronfishError> {
        let transmission_key = PublicAddress::load_transmission_key(&address_bytes[0..])?;

        Ok(PublicAddress { transmission_key })
    }

    /// Load a public address from a Read implementation (e.g: socket, file)
    pub fn read<R: io::Read>(reader: &mut R) -> Result<Self, IronfishError> {
        let mut address_bytes = [0; 32];
        reader.read_exact(&mut address_bytes)?;
        Self::new(&address_bytes)
    }

    /// Initialize a public address from a sapling key. Typically constructed from
    /// SaplingKey::public_address()
    pub fn from_key(sapling_key: &SaplingKey) -> PublicAddress {
        Self::from_view_key(sapling_key.incoming_view_key())
    }

    pub fn from_view_key(view_key: &IncomingViewKey) -> PublicAddress {
        PublicAddress {
            transmission_key: PUBLIC_KEY_GENERATOR * view_key.view_key,
        }
    }

    /// Convert a String of hex values to a PublicAddress. The String must
    /// be 64 hexadecimal characters representing the 32 bytes of an address
    /// or it fails.
    pub fn from_hex(value: &str) -> Result<Self, IronfishError> {
        if value.len() != 64 {
            return Err(IronfishError::InvalidPublicAddress);
        }

        match hex_to_bytes(value) {
            Err(()) => Err(IronfishError::InvalidPublicAddress),
            Ok(bytes) => {
                if bytes.len() != 32 {
                    Err(IronfishError::InvalidPublicAddress)
                } else {
                    let mut byte_arr = [0; 32];
                    byte_arr.clone_from_slice(&bytes[0..32]);
                    Self::new(&byte_arr)
                }
            }
        }
    }

    /// Retrieve the public address in byte form. It is comprised of the
    /// 11 byte diversifier followed by the 32 byte transmission key.
    pub fn public_address(&self) -> [u8; 32] {
        let mut result = [0; 32];
        result[..32].copy_from_slice(
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
    pub fn write<W: io::Write>(&self, mut writer: W) -> Result<(), IronfishError> {
        writer.write_all(&self.public_address())?;

        Ok(())
    }

    pub(crate) fn load_transmission_key(
        transmission_key_bytes: &[u8],
    ) -> Result<SubgroupPoint, IronfishError> {
        assert!(transmission_key_bytes.len() == 32);
        let transmission_key_non_prime =
            SubgroupPoint::from_bytes(transmission_key_bytes.try_into().unwrap());

        if transmission_key_non_prime.is_some().into() {
            Ok(transmission_key_non_prime.unwrap())
        } else {
            Err(IronfishError::InvalidPaymentAddress)
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
        let secret_key: jubjub::Fr = jubjub::Fr::random(thread_rng());
        let public_key = PUBLIC_KEY_GENERATOR * secret_key;

        (secret_key, public_key)
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

#[cfg(test)]
mod test {
    use crate::{PublicAddress, SaplingKey};

    #[test]
    fn public_address_validation() {
        let bad_address = "8a4685307f159e95418a0dd3d38a3245f488c1baf64bc914f53486efd370c562";
        let good_address = "8a4685307f159e95418a0dd3d38a3245f488c1baf64bc914f53486efd370c563";

        let bad_result = PublicAddress::from_hex(bad_address);
        assert!(bad_result.is_err());

        PublicAddress::from_hex(good_address).expect("returns a valid public address");
    }

    #[test]
    fn public_address_generation() {
        let sapling_key = SaplingKey::generate_key();
        let public_address = sapling_key.public_address();
        assert_eq!(public_address.public_address().len(), 32);
    }
}
