/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::keys::{ephemeral::EphemeralKeyPair, PUBLIC_ADDRESS_SIZE};

use super::{shared_secret, PublicAddress, SaplingKey};
use group::Curve;
use jubjub::ExtendedPoint;

#[test]
fn test_key_generation_and_construction() {
    let key = SaplingKey::generate_key();
    let key2 = SaplingKey::new(key.spending_key).unwrap();
    assert!(key.spending_key != [0; 32]);
    assert!(key2.spending_key == key.spending_key);
    assert!(key2.incoming_viewing_key.view_key == key.incoming_viewing_key.view_key);
}

#[test]
fn test_diffie_hellman_shared_key() {
    let key1 = SaplingKey::generate_key();

    let address1 = key1.public_address();

    let key_pair = EphemeralKeyPair::new();
    let secret_key = key_pair.secret();
    let public_key = key_pair.public();

    let shared_secret1 = shared_secret(secret_key, &address1.transmission_key, public_key);
    let shared_secret2 = shared_secret(&key1.incoming_viewing_key.view_key, public_key, public_key);
    assert_eq!(shared_secret1, shared_secret2);
}

#[test]
fn test_diffie_hellman_shared_key_with_other_key() {
    let key = SaplingKey::generate_key();
    let third_party_key = SaplingKey::generate_key();

    let address = key.public_address();
    let third_party_address = third_party_key.public_address();

    let key_pair = EphemeralKeyPair::new();
    let secret_key = key_pair.secret();
    let public_key = key_pair.public();

    let shared_secret1 = shared_secret(secret_key, &address.transmission_key, public_key);
    let shared_secret2 = shared_secret(&key.incoming_viewing_key.view_key, public_key, public_key);
    assert_eq!(shared_secret1, shared_secret2);

    let shared_secret_third_party1 = shared_secret(
        secret_key,
        &third_party_address.transmission_key,
        public_key,
    );
    assert_ne!(shared_secret1, shared_secret_third_party1);
    assert_ne!(shared_secret2, shared_secret_third_party1);

    let shared_secret_third_party2 = shared_secret(
        &third_party_key.incoming_viewing_key.view_key,
        public_key,
        public_key,
    );
    assert_ne!(shared_secret1, shared_secret_third_party2);
    assert_ne!(shared_secret2, shared_secret_third_party2);
}

#[test]
fn test_serialization() {
    let key = SaplingKey::generate_key();
    let mut serialized_key = [0; PUBLIC_ADDRESS_SIZE];
    key.write(&mut serialized_key[..])
        .expect("Should be able to serialize key");
    assert_ne!(serialized_key, [0; PUBLIC_ADDRESS_SIZE]);

    let read_back_key = SaplingKey::read(&mut serialized_key.as_ref())
        .expect("Should be able to load key from valid bytes");
    assert_eq!(
        read_back_key.incoming_view_key().view_key,
        key.incoming_view_key().view_key
    );

    let public_address = key.public_address();
    let mut serialized_address = [0; PUBLIC_ADDRESS_SIZE];
    public_address
        .write(&mut serialized_address[..])
        .expect("should be able to serialize address");

    let read_back_address: PublicAddress = PublicAddress::new(&serialized_address)
        .expect("Should be able to construct address from valid bytes");

    assert_eq!(
        ExtendedPoint::from(read_back_address.transmission_key).to_affine(),
        ExtendedPoint::from(public_address.transmission_key).to_affine()
    )
}

#[test]
fn test_hex_conversion() {
    let key = SaplingKey::generate_key();

    let hex = key.hex_spending_key();
    assert_eq!(hex.len(), 64);
    let second_key = SaplingKey::from_hex(&hex).unwrap();
    assert_eq!(second_key.spending_key, key.spending_key);

    let address = key.public_address();
    let hex = address.hex_public_address();
    assert_eq!(hex.len(), 2 * PUBLIC_ADDRESS_SIZE);
    let second_address = PublicAddress::from_hex(&hex).unwrap();
    assert_eq!(second_address, address);

    assert!(PublicAddress::from_hex("invalid").is_err());
}

#[test]
fn test_from_and_to_words() {
    let key_bytes = [
        213, 107, 36, 28, 169, 101, 179, 153, 116, 133, 204, 240, 100, 33, 116, 12, 29, 97, 22, 57,
        34, 173, 28, 2, 238, 105, 251, 224, 146, 83, 218, 247,
    ];
    let words_for_bytes = "step float already fan forest smile spirit ridge vacant canal fringe blouse stock mention tonight fiber bright blast omit water ankle clarify hint turn".to_owned();

    // Convert to words
    let key = SaplingKey::new(key_bytes).expect("Key should be created");
    let mnemonic = key
        .to_words(bip39::Language::English)
        .expect("Should return words");
    let words = mnemonic.into_phrase();
    assert_eq!(words_for_bytes, words);

    // Convert from words
    let key =
        SaplingKey::from_words(words, bip39::Language::English).expect("key should be created");
    assert_eq!(key.spending_key, key_bytes);
}
