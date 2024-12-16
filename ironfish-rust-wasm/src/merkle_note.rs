/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::{
    errors::IronfishError,
    keys::{IncomingViewKey, OutgoingViewKey},
    note::Note,
    primitives::Scalar,
    wasm_bindgen_wrapper,
};
use wasm_bindgen::prelude::*;

wasm_bindgen_wrapper! {
    #[derive(Clone, PartialEq, Eq, Debug)]
    pub struct MerkleNote(ironfish::MerkleNote);
}

#[wasm_bindgen]
impl MerkleNote {
    #[wasm_bindgen(constructor)]
    pub fn deserialize(bytes: &[u8]) -> Result<MerkleNote, IronfishError> {
        Ok(Self(ironfish::MerkleNote::read(bytes)?))
    }

    #[wasm_bindgen]
    pub fn serialize(&self) -> Vec<u8> {
        let mut buf = Vec::new();
        self.0
            .write(&mut buf)
            .expect("failed to serialize merkle note");
        buf
    }

    #[wasm_bindgen(getter, js_name = merkleHash)]
    pub fn merkle_hash(&self) -> MerkleNoteHash {
        self.0.merkle_hash().into()
    }

    #[wasm_bindgen(js_name = decryptNoteForOwner)]
    pub fn decrypt_note_for_owner(
        &self,
        owner_view_key: &IncomingViewKey,
    ) -> Result<Note, IronfishError> {
        self.0
            .decrypt_note_for_owner(owner_view_key.as_ref())
            .map(|n| n.into())
            .map_err(|e| e.into())
    }

    #[wasm_bindgen(js_name = decryptNoteForOwners)]
    pub fn decrypt_note_for_owners(&self, owner_view_keys: Vec<IncomingViewKey>) -> Vec<Note> {
        // The original `decrypt_note_for_owners` returns a `Vec<Result<Note, E>>`. Here instead we
        // are filtering out all errors. This likely makes this method hard to use in practice,
        // because the information for mapping between the original owner and the resulting note is
        // lost. However, returing a `Vec<Result>` or a `Vec<Option>` is currently unsupported in
        // wasm-bindgen, so offering equivalent functionality requires a new custom type, which can
        // be implemented at a later date.
        self.0
            .decrypt_note_for_owners(
                owner_view_keys
                    .into_iter()
                    .map(|k| k.into())
                    .collect::<Vec<_>>()
                    .as_slice(),
            )
            .into_iter()
            .filter_map(Result::ok)
            .map(|n| n.into())
            .collect()
    }

    #[wasm_bindgen(js_name = decryptNoteForSpender)]
    pub fn decrypt_note_for_spender(
        &self,
        spender_key: &OutgoingViewKey,
    ) -> Result<Note, IronfishError> {
        self.0
            .decrypt_note_for_spender(spender_key.as_ref())
            .map(|n| n.into())
            .map_err(|e| e.into())
    }
}

wasm_bindgen_wrapper! {
    #[derive(Clone, PartialEq, Eq, Debug)]
    pub struct MerkleNoteHash(ironfish::MerkleNoteHash);
}

#[wasm_bindgen]
impl MerkleNoteHash {
    #[wasm_bindgen(constructor)]
    pub fn deserialize(bytes: &[u8]) -> Result<MerkleNoteHash, IronfishError> {
        Ok(Self(ironfish::MerkleNoteHash::read(bytes)?))
    }

    #[wasm_bindgen]
    pub fn serialize(&self) -> Vec<u8> {
        let mut buf = Vec::new();
        self.0
            .write(&mut buf)
            .expect("failed to serialize merkle note hash");
        buf
    }

    #[wasm_bindgen(js_name = fromValue)]
    pub fn from_value(value: Scalar) -> Self {
        ironfish::MerkleNoteHash(value.as_ref().to_owned()).into()
    }

    #[wasm_bindgen(getter)]
    pub fn value(&self) -> Scalar {
        self.0 .0.into()
    }

    #[wasm_bindgen(js_name = combineHash)]
    pub fn combine_hash(depth: usize, left: &Self, right: &Self) -> Self {
        let hash = ironfish::MerkleNoteHash::combine_hash(depth, &left.0 .0, &right.0 .0);
        ironfish::MerkleNoteHash(hash).into()
    }
}

#[cfg(test)]
mod tests {
    use crate::{
        keys::SaplingKey,
        merkle_note::{MerkleNote, MerkleNoteHash},
    };
    use hex_literal::hex;
    use wasm_bindgen_test::wasm_bindgen_test;

    // Merkle note copied from one of the fixtures in the `ironfish` NodeJS package
    const TEST_MERKLE_NOTE_BYTES: [u8; 329] = hex!(
        "d76e3e7f7f85065f696d6e3587450d8386ae9a62b61aa664eec642afdea715a4b1aaff663825233b351fb068cf\
        7a9fcba6d17be2f2e56c9848ea1ce44ce0955e0d32fcadc2c462235e7b626bf3b0d6b6dcc261816efebb42b5040\
        947546e95d898ab93198324e66d612e6975e26ea1f4356b294b6994a18fd76a0b829f8ab94576026110768de2cc\
        ff9aea405331b128edd905049d286283cc0a0db6302801f8be21b3767ed2ff36b2c7a712f46f89d2e87647e55b4\
        97225daf24719a713bce9a8522c62f1fb04e6ce67a966da2641d98e9e03a0da925f720040b48acfc30b64e91ca9\
        f119dcef85ea8bfbc906f203fc1351550995988a3549726f6e2046697368206e6f746520656e6372797074696f6\
        e206d696e6572206b65793030303030303030303030303030303030303030303030303030303030303030303030\
        3030303030303030303000"
    );

    // Key that owns the above note
    const TEST_SAPLING_KEY_BYTES: [u8; 32] =
        hex!("2301a28b5c47a79d328e11485647b3da876678028d8312dc40e726e8e118fe1a");

    #[test]
    #[wasm_bindgen_test]
    fn combine_hash() {
        let a = MerkleNoteHash::deserialize(
            hex!("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa00").as_slice(),
        )
        .unwrap();
        let b = MerkleNoteHash::deserialize(
            hex!("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb00").as_slice(),
        )
        .unwrap();
        let c = MerkleNoteHash::combine_hash(10, &a, &b);
        assert_eq!(
            c.serialize(),
            hex!("65fa868a24f39bead19143c23b7c37c6966bec5cf5e60269cb7964d407fe3d47")
        );
    }

    #[test]
    #[wasm_bindgen_test]
    fn decrypt_note_for_owner() {
        let key = SaplingKey::deserialize(TEST_SAPLING_KEY_BYTES.as_slice()).unwrap();
        let merkle_note = MerkleNote::deserialize(TEST_MERKLE_NOTE_BYTES.as_slice())
            .expect("deserialization failed");
        let note = merkle_note
            .decrypt_note_for_owner(&key.incoming_view_key())
            .expect("decryption failed");

        assert_eq!(note.value(), 2_000_000_000);
    }

    #[test]
    #[wasm_bindgen_test]
    fn decrypt_note_for_owners() {
        let key = SaplingKey::deserialize(TEST_SAPLING_KEY_BYTES.as_slice()).unwrap();
        let merkle_note = MerkleNote::deserialize(TEST_MERKLE_NOTE_BYTES.as_slice())
            .expect("deserialization failed");
        let notes = merkle_note.decrypt_note_for_owners(vec![key.incoming_view_key()]);

        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].value(), 2_000_000_000);
    }
}
