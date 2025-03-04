/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::{
    errors::IronfishError,
    keys::SaplingKey,
    primitives::{Nullifier, PublicKey, Scalar, Signature},
    wasm_bindgen_wrapper,
};
use ironfish::errors::IronfishErrorKind;
use wasm_bindgen::prelude::*;

#[cfg(feature = "transaction-builders")]
use crate::{
    keys::{ProofGenerationKey, ViewKey},
    note::Note,
    primitives::Fr,
    witness::Witness,
};

wasm_bindgen_wrapper! {
    #[derive(Clone, Debug)]
    pub struct SpendDescription(ironfish::SpendDescription);
}

#[wasm_bindgen]
impl SpendDescription {
    #[wasm_bindgen(constructor)]
    pub fn deserialize(bytes: &[u8]) -> Result<SpendDescription, IronfishError> {
        Ok(Self(ironfish::SpendDescription::read(bytes)?))
    }

    #[wasm_bindgen]
    pub fn serialize(&self) -> Vec<u8> {
        let mut buf = Vec::new();
        self.0
            .write(&mut buf)
            .expect("failed to serialize spend description");
        buf
    }

    #[wasm_bindgen(getter)]
    pub fn nullifier(&self) -> Nullifier {
        self.0.nullifier().into()
    }

    #[wasm_bindgen(getter, js_name = rootHash)]
    pub fn root_hash(&self) -> Scalar {
        self.0.root_hash().into()
    }

    #[wasm_bindgen(getter, js_name = treeSize)]
    pub fn tree_size(&self) -> u32 {
        self.0.tree_size()
    }

    #[wasm_bindgen(js_name = verifySignature)]
    pub fn verify_signature(
        &self,
        signature: &[u8],
        randomized_public_key: &PublicKey,
    ) -> Result<(), IronfishError> {
        let signature = signature
            .try_into()
            .map_err(|_| IronfishErrorKind::InvalidSignature)?;
        self.0
            .verify_signature(signature, randomized_public_key.as_ref())
            .map_err(|e| e.into())
    }

    #[wasm_bindgen(js_name = partialVerify)]
    pub fn partial_verify(&self) -> Result<(), IronfishError> {
        self.0.partial_verify().map_err(|e| e.into())
    }

    #[wasm_bindgen(js_name = publicInputs)]
    pub fn public_inputs(&self, randomized_public_key: &PublicKey) -> Vec<Scalar> {
        self.0
            .public_inputs(randomized_public_key.as_ref())
            .into_iter()
            .map(Scalar::from)
            .collect()
    }
}

wasm_bindgen_wrapper! {
    #[derive(Clone, Debug)]
    pub struct UnsignedSpendDescription(ironfish::transaction::spends::UnsignedSpendDescription);
}

#[wasm_bindgen]
impl UnsignedSpendDescription {
    #[wasm_bindgen(constructor)]
    pub fn deserialize(bytes: &[u8]) -> Result<Self, IronfishError> {
        Ok(Self(
            ironfish::transaction::spends::UnsignedSpendDescription::read(bytes)?,
        ))
    }

    #[wasm_bindgen]
    pub fn serialize(&self) -> Vec<u8> {
        let mut buf = Vec::new();
        self.0
            .write(&mut buf)
            .expect("failed to serialize unsigned spend description");
        buf
    }

    #[wasm_bindgen]
    pub fn sign(
        self,
        spender_key: &SaplingKey,
        signature_hash: &[u8],
    ) -> Result<SpendDescription, IronfishError> {
        let signature_hash: &[u8; 32] = signature_hash
            .try_into()
            .map_err(|_| IronfishErrorKind::InvalidData)?;
        self.0
            .sign(spender_key.as_ref(), signature_hash)
            .map(|d| d.into())
            .map_err(|e| e.into())
    }

    #[wasm_bindgen(js_name = addSignature)]
    pub fn add_signature(self, signature: Signature) -> SpendDescription {
        self.0.add_signature(signature.into()).into()
    }
}

#[cfg(feature = "transaction-builders")]
wasm_bindgen_wrapper! {
    #[derive(Clone, Debug)]
    pub struct SpendBuilder(ironfish::transaction::spends::SpendBuilder);
}

#[wasm_bindgen]
#[cfg(feature = "transaction-builders")]
impl SpendBuilder {
    #[wasm_bindgen(constructor)]
    pub fn new(note: Note, witness: &Witness) -> Self {
        Self(ironfish::transaction::spends::SpendBuilder::new(
            note.into(),
            witness.as_ref(),
        ))
    }

    #[wasm_bindgen]
    pub fn build(
        self,
        proof_generation_key: &ProofGenerationKey,
        view_key: &ViewKey,
        public_key_randomness: &Fr,
        randomized_public_key: &PublicKey,
    ) -> Result<UnsignedSpendDescription, IronfishError> {
        self.0
            .build(
                proof_generation_key.as_ref(),
                view_key.as_ref(),
                public_key_randomness.as_ref(),
                randomized_public_key.as_ref(),
            )
            .map(|d| d.into())
            .map_err(|e| e.into())
    }
}

#[cfg(test)]
#[cfg(feature = "transaction-builders")]
mod tests {
    mod builder {
        use crate::{
            assets::AssetIdentifier,
            keys::SaplingKey,
            merkle_note::MerkleNoteHash,
            note::Note,
            primitives::Scalar,
            transaction::SpendBuilder,
            witness::{Witness, WitnessNode},
        };
        use rand::{thread_rng, Rng};
        use wasm_bindgen_test::wasm_bindgen_test;

        fn random_witness(note: &Note) -> Witness {
            let depth = 32;
            let zero = Scalar::zero();
            let auth_path = vec![WitnessNode::left(zero); depth];
            let root_hash = {
                let mut cur_hash = MerkleNoteHash::from_value(note.commitment_point());
                for (i, node) in auth_path.iter().enumerate() {
                    cur_hash = MerkleNoteHash::combine_hash(i, &cur_hash, &node.hash())
                }
                cur_hash
            };

            Witness::new(depth, root_hash, auth_path)
        }

        #[test]
        #[wasm_bindgen_test]
        fn build() {
            let owner_key = SaplingKey::random();
            let sender_key = SaplingKey::random();
            let note = Note::from_parts(
                owner_key.public_address(),
                123,
                "some memo",
                AssetIdentifier::native(),
                sender_key.public_address(),
            );
            let witness = random_witness(&note);
            let randomized_public_key_pair = owner_key.view_key().randomized_public_key_pair();

            let unsigned = SpendBuilder::new(note, &witness)
                .build(
                    &owner_key.proof_generation_key(),
                    &owner_key.view_key(),
                    &randomized_public_key_pair.public_key_randomness(),
                    &randomized_public_key_pair.randomized_public_key(),
                )
                .expect("failed to build spend description");

            let sign_hash: [u8; 32] = thread_rng().gen();
            let signed = unsigned
                .sign(&owner_key, &sign_hash)
                .expect("failed to sign mint description");

            signed
                .verify_signature(
                    &sign_hash,
                    &randomized_public_key_pair.randomized_public_key(),
                )
                .expect("signature verification failed");
        }
    }
}
