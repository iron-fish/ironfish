/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use ironfish_rust::sapling_bls12;
use ironfish_rust::MerkleNote;
use wasm_bindgen::prelude::*;

use super::{panic_hook, WasmIoError, WasmNote, WasmSaplingKeyError};

#[wasm_bindgen]
pub struct WasmNoteEncrypted {
    pub(crate) note: sapling_bls12::MerkleNote,
}

#[wasm_bindgen]
impl WasmNoteEncrypted {
    #[wasm_bindgen]
    pub fn deserialize(bytes: &[u8]) -> Result<WasmNoteEncrypted, JsValue> {
        panic_hook::set_once();

        let hasher = sapling_bls12::SAPLING.clone();
        let cursor: std::io::Cursor<&[u8]> = std::io::Cursor::new(bytes);
        let note = MerkleNote::read(cursor, hasher).map_err(WasmIoError)?;
        Ok(WasmNoteEncrypted { note })
    }

    #[wasm_bindgen]
    pub fn serialize(&self) -> Result<Vec<u8>, JsValue> {
        let mut cursor: std::io::Cursor<Vec<u8>> = std::io::Cursor::new(vec![]);
        self.note.write(&mut cursor).map_err(WasmIoError)?;
        Ok(cursor.into_inner())
    }

    #[wasm_bindgen]
    pub fn equals(&self, other: &WasmNoteEncrypted) -> bool {
        self.note.eq(&other.note)
    }

    #[wasm_bindgen(js_name = "merkleHash")]
    pub fn merkle_hash(&self) -> Result<Vec<u8>, JsValue> {
        let mut cursor: Vec<u8> = Vec::with_capacity(32);
        self.note
            .merkle_hash()
            .write(&mut cursor)
            .map_err(WasmIoError)?;
        Ok(cursor)
    }

    /// Hash two child hashes together to calculate the hash of the
    /// new parent
    #[wasm_bindgen(js_name = "combineHash")]
    pub fn combine_hash(depth: usize, left: &[u8], right: &[u8]) -> Result<Vec<u8>, JsValue> {
        let mut left_hash_reader: std::io::Cursor<&[u8]> = std::io::Cursor::new(left);
        let mut right_hash_reader: std::io::Cursor<&[u8]> = std::io::Cursor::new(right);
        let left_hash =
            sapling_bls12::MerkleNoteHash::read(&mut left_hash_reader).map_err(WasmIoError)?;
        let right_hash =
            sapling_bls12::MerkleNoteHash::read(&mut right_hash_reader).map_err(WasmIoError)?;

        let mut cursor: Vec<u8> = Vec::with_capacity(32);

        sapling_bls12::MerkleNoteHash::new(sapling_bls12::MerkleNoteHash::combine_hash(
            &sapling_bls12::SAPLING.clone(),
            depth,
            &left_hash.0,
            &right_hash.0,
        ))
        .write(&mut cursor)
        .map_err(WasmIoError)?;

        Ok(cursor)
    }

    /// Returns undefined if the note was unable to be decrypted with the given key.
    #[wasm_bindgen(js_name = "decryptNoteForOwner")]
    pub fn decrypt_note_for_owner(&self, owner_hex_key: &str) -> Result<Option<WasmNote>, JsValue> {
        let owner_view_key =
            sapling_bls12::IncomingViewKey::from_hex(sapling_bls12::SAPLING.clone(), owner_hex_key)
                .map_err(WasmSaplingKeyError)?;
        Ok(match self.note.decrypt_note_for_owner(&owner_view_key) {
            Ok(n) => Some(WasmNote { note: { n } }),
            Err(_) => None,
        })
    }

    /// Returns undefined if the note was unable to be decrypted with the given key.
    #[wasm_bindgen(js_name = "decryptNoteForSpender")]
    pub fn decrypt_note_for_spender(
        &self,
        spender_hex_key: &str,
    ) -> Result<Option<WasmNote>, JsValue> {
        let spender_view_key = sapling_bls12::OutgoingViewKey::from_hex(
            sapling_bls12::SAPLING.clone(),
            spender_hex_key,
        )
        .map_err(WasmSaplingKeyError)?;

        Ok(
            match self.note.decrypt_note_for_spender(&spender_view_key) {
                Ok(n) => Some(WasmNote { note: { n } }),
                Err(_) => None,
            },
        )
    }
}

#[cfg(test)]
mod tests {
    use rand::{thread_rng, Rng};
    use zcash_primitives::{
        jubjub::{fs::Fs, ToUniform},
        primitives::ValueCommitment,
    };

    use super::*;
    use ironfish_rust::merkle_note::MerkleNote;
    use ironfish_rust::note::Memo;
    use ironfish_rust::sapling_bls12::Note;
    use ironfish_rust::SaplingKey;
    use pairing::bls12_381::Bls12;

    #[test]
    fn test_merkle_notes_are_equal() {
        let spender_key: SaplingKey<Bls12> =
            SaplingKey::generate_key(sapling_bls12::SAPLING.clone());
        let receiver_key: SaplingKey<Bls12> =
            SaplingKey::generate_key(sapling_bls12::SAPLING.clone());
        let owner = receiver_key.generate_public_address();
        let note = Note::new(
            sapling_bls12::SAPLING.clone(),
            owner.clone(),
            42,
            Memo([0; 32]),
        );
        let diffie_hellman_keys =
            owner.generate_diffie_hellman_keys(&sapling_bls12::SAPLING.jubjub);

        let mut buffer = [0u8; 64];
        thread_rng().fill(&mut buffer[..]);

        let value_commitment_randomness: Fs = Fs::to_uniform(&buffer[..]);

        let value_commitment = ValueCommitment::<Bls12> {
            value: note.value(),
            randomness: value_commitment_randomness,
        };

        let merkle_note =
            MerkleNote::new(&spender_key, &note, &value_commitment, &diffie_hellman_keys);

        let mut cursor: std::io::Cursor<Vec<u8>> = std::io::Cursor::new(vec![]);
        merkle_note.write(&mut cursor).unwrap();

        let vec = cursor.into_inner();
        let wasm1 = WasmNoteEncrypted::deserialize(&vec).unwrap();
        let wasm2 = WasmNoteEncrypted::deserialize(&vec).unwrap();
        assert!(wasm1.equals(&wasm2))
    }

    #[test]
    fn test_can_combine_merkle_note_hashes() {
        let arr: [u8; 32] = Default::default();
        let combined_hash = WasmNoteEncrypted::combine_hash(1, &arr, &arr).unwrap();

        let expected = &[
            78, 74, 99, 96, 68, 196, 78, 82, 234, 152, 143, 34, 78, 141, 112, 9, 118, 118, 97, 40,
            219, 166, 197, 144, 93, 94, 133, 118, 88, 127, 57, 32,
        ];
        assert_eq!(&combined_hash, &expected)
    }
}
