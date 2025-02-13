/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::{
    assets::AssetIdentifier,
    errors::IronfishError,
    keys::{IncomingViewKey, PublicAddress, ViewKey},
    primitives::{ExtendedPoint, Nullifier, Scalar},
    wasm_bindgen_wrapper,
};
use ironfish::errors::IronfishErrorKind;
use wasm_bindgen::prelude::*;

wasm_bindgen_wrapper! {
    #[derive(Clone, PartialEq, Eq, Debug)]
    pub struct Note(ironfish::Note);
}

#[wasm_bindgen]
impl Note {
    #[wasm_bindgen(constructor)]
    pub fn deserialize(bytes: &[u8]) -> Result<Self, IronfishError> {
        Ok(Self(ironfish::Note::read(bytes)?))
    }

    #[wasm_bindgen]
    pub fn serialize(&self) -> Vec<u8> {
        let mut buf = Vec::new();
        self.0.write(&mut buf).expect("failed to serialize note");
        buf
    }

    #[wasm_bindgen(js_name = fromParts)]
    pub fn from_parts(
        owner: PublicAddress,
        value: u64,
        memo: &str,
        asset_id: AssetIdentifier,
        sender: PublicAddress,
    ) -> Self {
        Self(ironfish::Note::new(
            owner.into(),
            value,
            memo,
            asset_id.into(),
            sender.into(),
        ))
    }

    #[wasm_bindgen(getter)]
    pub fn value(&self) -> u64 {
        self.0.value()
    }

    #[wasm_bindgen(getter)]
    pub fn memo(&self) -> Vec<u8> {
        self.0.memo().0.to_vec()
    }

    #[wasm_bindgen(getter)]
    pub fn owner(&self) -> PublicAddress {
        self.0.owner().into()
    }

    #[wasm_bindgen(getter)]
    pub fn asset_generator(&self) -> ExtendedPoint {
        self.0.asset_generator().into()
    }

    #[wasm_bindgen(getter)]
    pub fn asset_id(&self) -> AssetIdentifier {
        self.0.asset_id().to_owned().into()
    }

    #[wasm_bindgen(getter)]
    pub fn sender(&self) -> PublicAddress {
        self.0.sender().into()
    }

    #[wasm_bindgen(getter)]
    pub fn commitment(&self) -> Vec<u8> {
        self.0.commitment().to_vec()
    }

    #[wasm_bindgen(getter, js_name = commitmentPoint)]
    pub fn commitment_point(&self) -> Scalar {
        self.0.commitment_point().into()
    }

    #[wasm_bindgen]
    pub fn encrypt(&self, shared_secret: &[u8]) -> Result<Vec<u8>, IronfishError> {
        let shared_secret: &[u8; 32] = shared_secret
            .try_into()
            .map_err(|_| IronfishErrorKind::InvalidData)?;
        Ok(self.0.encrypt(shared_secret).to_vec())
    }

    #[wasm_bindgen(js_name = fromOwnerEncrypted)]
    pub fn from_owner_encrypted(
        owner_view_key: &IncomingViewKey,
        shared_secret: &[u8],
        encrypted_bytes: &[u8],
    ) -> Result<Self, IronfishError> {
        let shared_secret: &[u8; 32] = shared_secret
            .try_into()
            .map_err(|_| IronfishErrorKind::InvalidData)?;
        let encrypted_bytes: &[u8; 152] = encrypted_bytes
            .try_into()
            .map_err(|_| IronfishErrorKind::InvalidData)?;
        Ok(Self(ironfish::Note::from_owner_encrypted(
            owner_view_key.as_ref(),
            shared_secret,
            encrypted_bytes,
        )?))
    }

    #[wasm_bindgen]
    pub fn nullifier(&self, view_key: &ViewKey, position: u64) -> Nullifier {
        self.0.nullifier(view_key.as_ref(), position).into()
    }
}

#[cfg(test)]
mod tests {
    use crate::{
        assets::AssetIdentifier,
        keys::{PublicAddress, SaplingKey},
        note::Note,
    };
    use hex_literal::hex;
    use rand::{thread_rng, Rng};
    use wasm_bindgen_test::wasm_bindgen_test;

    const TEST_NOTE_BYTES: [u8; 168] = hex!(
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0cccccccccccccccccccccccccc\
        ccccccccccccccccccccccccccccccccccccc07b0000000000000000e2fb75515b55ed7f84be996ef80dae38b3d\
        2076d1ffffd0970b641cde4060e736f6d65206d656d6fe29c8e0000000000000000000000000000000000000000\
        bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbf"
    );

    #[test]
    #[wasm_bindgen_test]
    fn deserialize() {
        let note = Note::deserialize(TEST_NOTE_BYTES.as_slice())
            .expect("reading note should have succeeded");

        assert_eq!(
            note.owner().serialize(),
            hex!("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0")
        );
        assert_eq!(
            note.sender().serialize(),
            hex!("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbf")
        );
        assert_eq!(note.value(), 123);
        assert_eq!(
            note.memo(),
            b"some memo\xe2\x9c\x8e\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0"
        );
        assert_eq!(
            note.asset_id().serialize(),
            hex!("ccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc0")
        );
        assert_eq!(
            note.commitment(),
            hex!("d044ae177718d5282807186168253e33a080e45a19be4cc27dc47b0a7146450d")
        );
        assert_eq!(note.serialize(), TEST_NOTE_BYTES);
    }

    #[test]
    #[wasm_bindgen_test]
    fn from_parts() {
        let owner = PublicAddress::deserialize(
            hex!("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0").as_slice(),
        )
        .unwrap();
        let sender = PublicAddress::deserialize(
            hex!("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbf").as_slice(),
        )
        .unwrap();
        let asset_id = AssetIdentifier::deserialize(
            hex!("ccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc0").as_slice(),
        )
        .unwrap();

        let note = Note::from_parts(
            owner.clone(),
            123,
            "some memo✎",
            asset_id.clone(),
            sender.clone(),
        );

        assert_eq!(note.owner(), owner);
        assert_eq!(note.value(), 123);
        assert_eq!(
            note.memo(),
            b"some memo\xe2\x9c\x8e\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0"
        );
        assert_eq!(note.asset_id(), asset_id);
        assert_eq!(note.sender(), sender);
    }

    #[test]
    #[wasm_bindgen_test]
    fn encrypt_decrypt_roundtrip() {
        let owner_key = SaplingKey::random();
        let sender_key = SaplingKey::random();
        let note = Note::from_parts(
            owner_key.public_address(),
            123_456_789,
            "memo",
            AssetIdentifier::native(),
            sender_key.public_address(),
        );

        let shared_secret: [u8; 32] = thread_rng().gen();
        let encrypted = note.encrypt(&shared_secret).expect("encryption failed");

        let decrypted =
            Note::from_owner_encrypted(&owner_key.incoming_view_key(), &shared_secret, &encrypted)
                .expect("decryption failed");

        assert_eq!(decrypted, note);
    }
}
