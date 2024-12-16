/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::{
    errors::IronfishError,
    keys::{IncomingViewKey, OutgoingViewKey, ProofGenerationKey, PublicAddress, ViewKey},
    wasm_bindgen_wrapper,
};
use wasm_bindgen::prelude::*;

wasm_bindgen_wrapper! {
    #[derive(Clone, PartialEq, Eq, Debug)]
    pub struct SaplingKey(ironfish::keys::SaplingKey);
}

#[wasm_bindgen]
impl SaplingKey {
    #[wasm_bindgen(constructor)]
    pub fn deserialize(bytes: &[u8]) -> Result<Self, IronfishError> {
        Ok(Self(ironfish::keys::SaplingKey::read(bytes)?))
    }

    #[wasm_bindgen]
    pub fn serialize(&self) -> Vec<u8> {
        let mut buf = Vec::new();
        self.0
            .write(&mut buf)
            .expect("failed to serialize sapling key");
        buf
    }

    #[wasm_bindgen]
    pub fn random() -> Self {
        Self(ironfish::keys::SaplingKey::generate_key())
    }

    #[wasm_bindgen(js_name = fromHex)]
    pub fn from_hex(hex: &str) -> Result<Self, IronfishError> {
        Ok(Self(ironfish::keys::SaplingKey::from_hex(hex)?))
    }

    #[wasm_bindgen(js_name = toHex)]
    pub fn to_hex(&self) -> String {
        self.0.hex_spending_key()
    }

    // TODO: to/fromWords

    #[wasm_bindgen(getter, js_name = publicAddress)]
    pub fn public_address(&self) -> PublicAddress {
        self.0.public_address().into()
    }

    #[wasm_bindgen(getter, js_name = spendingKey)]
    pub fn spending_key(&self) -> Vec<u8> {
        self.0.spending_key().to_vec()
    }

    #[wasm_bindgen(getter, js_name = incomingViewKey)]
    pub fn incoming_view_key(&self) -> IncomingViewKey {
        self.0.incoming_view_key().to_owned().into()
    }

    #[wasm_bindgen(getter, js_name = outgoingViewKey)]
    pub fn outgoing_view_key(&self) -> OutgoingViewKey {
        self.0.outgoing_view_key().to_owned().into()
    }

    #[wasm_bindgen(getter, js_name = viewKey)]
    pub fn view_key(&self) -> ViewKey {
        self.0.view_key().to_owned().into()
    }

    #[wasm_bindgen(getter, js_name = proofGenerationKey)]
    pub fn proof_generation_key(&self) -> ProofGenerationKey {
        self.0.sapling_proof_generation_key().into()
    }
}

#[cfg(test)]
mod tests {
    use crate::keys::{IncomingViewKey, OutgoingViewKey, ProofGenerationKey, SaplingKey, ViewKey};
    use wasm_bindgen_test::wasm_bindgen_test;

    macro_rules! assert_serde_ok {
        ( $type:ty, $key:expr ) => {
            assert_eq!(
                $key,
                <$type>::deserialize($key.serialize().as_slice()).expect("deserialization failed")
            )
        };
    }

    #[test]
    #[wasm_bindgen_test]
    fn serialization_roundtrip() {
        let key = SaplingKey::random();
        assert_serde_ok!(SaplingKey, key);
        assert_serde_ok!(IncomingViewKey, key.incoming_view_key());
        assert_serde_ok!(OutgoingViewKey, key.outgoing_view_key());
        assert_serde_ok!(ViewKey, key.view_key());
        assert_serde_ok!(ProofGenerationKey, key.proof_generation_key());
    }
}
