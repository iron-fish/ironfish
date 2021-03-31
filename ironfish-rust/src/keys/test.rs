/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use super::{shared_secret, PublicAddress, SaplingKey};
use crate::sapling_bls12;
use pairing::bls12_381::Bls12;

#[test]
fn test_key_generation_and_construction() {
    let sapling = &*sapling_bls12::SAPLING;
    let key: SaplingKey<Bls12> = SaplingKey::generate_key(sapling.clone());
    let key2: SaplingKey<Bls12> = SaplingKey::new(sapling.clone(), key.spending_key).unwrap();
    assert!(key.spending_key != [0; 32]);
    assert!(key2.spending_key == key.spending_key);
    assert!(key2.incoming_viewing_key.view_key == key.incoming_viewing_key.view_key);

    // should not fail or infinite loop
    key2.generate_public_address();
}

#[test]
fn test_diffie_hellman_shared_key() {
    let sapling = &*sapling_bls12::SAPLING;
    let key1: SaplingKey<Bls12> = SaplingKey::generate_key(sapling.clone());

    // second address has to use the same diversifier for the keys to be valid
    let address1 = key1.generate_public_address();
    let (secret_key, public_key) = address1.generate_diffie_hellman_keys(&sapling.jubjub);
    let shared_secret1 = shared_secret(
        &sapling.jubjub,
        &secret_key,
        &address1.transmission_key,
        &public_key,
    );
    let shared_secret2 = shared_secret(
        &sapling.jubjub,
        &key1.incoming_viewing_key.view_key,
        &public_key,
        &public_key,
    );
    if shared_secret1 != shared_secret2 {
        assert!(false, "secrets don't match");
    }
}

#[test]
fn test_serialization() {
    let sapling = &*sapling_bls12::SAPLING;
    let key: SaplingKey<Bls12> = SaplingKey::generate_key(sapling.clone());
    let mut serialized_key = [0; 32];
    key.write(&mut serialized_key[..])
        .expect("Should be able to serialize key");
    assert_ne!(serialized_key, [0; 32]);

    let read_back_key: SaplingKey<Bls12> =
        SaplingKey::read(sapling.clone(), &mut serialized_key.as_ref())
            .expect("Should be able to load key from valid bytes");
    assert_eq!(
        read_back_key.incoming_view_key().view_key,
        key.incoming_view_key().view_key
    );

    let public_address = key.generate_public_address();
    let mut serialized_address = [0; 43];
    public_address
        .write(&mut serialized_address[..])
        .expect("should be able to serialize address");

    let read_back_address: PublicAddress<Bls12> =
        PublicAddress::new(sapling.clone(), &serialized_address)
            .expect("Should be able to construct address from valid bytes");
    assert_eq!(
        read_back_address.diversifier.0,
        public_address.diversifier.0
    );
    assert_eq!(
        read_back_address.diversifier_point.to_xy(),
        public_address.diversifier_point.to_xy()
    );
    assert_eq!(
        read_back_address.transmission_key.to_xy(),
        public_address.transmission_key.to_xy()
    )
}

#[test]
fn test_hex_conversion() {
    let sapling = &*sapling_bls12::SAPLING;
    let key: SaplingKey<Bls12> = SaplingKey::generate_key(sapling.clone());

    let hex = key.hex_spending_key();
    assert_eq!(hex.len(), 64);
    let second_key: SaplingKey<Bls12> = SaplingKey::from_hex(sapling.clone(), &hex).unwrap();
    assert_eq!(second_key.spending_key, key.spending_key);

    let address = key.generate_public_address();
    let hex = address.hex_public_address();
    assert_eq!(hex.len(), 86);
    let second_address = PublicAddress::from_hex(sapling.clone(), &hex).unwrap();
    assert_eq!(second_address, address);

    assert!(PublicAddress::from_hex(sapling.clone(), "invalid").is_err());
}
