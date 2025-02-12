/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::{
    errors::IronfishError,
    keys::{Language, PublicAddress},
    primitives::{Fr, PublicKey},
    wasm_bindgen_wrapper,
};
use ironfish_zkp::constants::SPENDING_KEY_GENERATOR;
use rand::thread_rng;
use wasm_bindgen::prelude::*;

wasm_bindgen_wrapper! {
    #[derive(Clone, PartialEq, Eq, Debug)]
    pub struct IncomingViewKey(ironfish::keys::IncomingViewKey);
}

#[wasm_bindgen]
impl IncomingViewKey {
    #[wasm_bindgen(constructor)]
    pub fn deserialize(bytes: &[u8]) -> Result<Self, IronfishError> {
        Ok(Self(ironfish::keys::IncomingViewKey::read(bytes)?))
    }

    #[wasm_bindgen]
    pub fn serialize(&self) -> Vec<u8> {
        self.0.to_bytes().to_vec()
    }

    #[wasm_bindgen(js_name = fromHex)]
    pub fn from_hex(hex: &str) -> Result<Self, IronfishError> {
        Ok(Self(ironfish::keys::IncomingViewKey::from_hex(hex)?))
    }

    #[wasm_bindgen(js_name = toHex)]
    pub fn to_hex(&self) -> String {
        self.0.hex_key()
    }

    #[wasm_bindgen(js_name = fromWords)]
    pub fn from_words(lang: Language, words: &str) -> Result<Self, IronfishError> {
        ironfish::keys::IncomingViewKey::from_words(lang.language_code().as_ref(), words)
            .map(|key| key.into())
            .map_err(|err| err.into())
    }

    #[wasm_bindgen(js_name = toWords)]
    pub fn to_words(&self, lang: Language) -> String {
        // `words_key()` may fail only if the language code is invalid, but here we're accepting
        // `Language`, not an arbitrary input, so the language code is guaranteed to be valid.
        self.0
            .words_key(lang.language_code().as_ref())
            .expect("conversion to words failed")
    }

    #[wasm_bindgen(getter, js_name = publicAddress)]
    pub fn public_address(&self) -> PublicAddress {
        self.0.public_address().into()
    }
}

wasm_bindgen_wrapper! {
    #[derive(Clone, PartialEq, Eq, Debug)]
    pub struct OutgoingViewKey(ironfish::keys::OutgoingViewKey);
}

#[wasm_bindgen]
impl OutgoingViewKey {
    #[wasm_bindgen(constructor)]
    pub fn deserialize(bytes: &[u8]) -> Result<Self, IronfishError> {
        Ok(Self(ironfish::keys::OutgoingViewKey::read(bytes)?))
    }

    #[wasm_bindgen]
    pub fn serialize(&self) -> Vec<u8> {
        self.0.to_bytes().to_vec()
    }

    #[wasm_bindgen(js_name = fromHex)]
    pub fn from_hex(hex: &str) -> Result<Self, IronfishError> {
        Ok(Self(ironfish::keys::OutgoingViewKey::from_hex(hex)?))
    }

    #[wasm_bindgen(js_name = toHex)]
    pub fn to_hex(&self) -> String {
        self.0.hex_key()
    }

    #[wasm_bindgen(js_name = fromWords)]
    pub fn from_words(lang: Language, words: &str) -> Result<Self, IronfishError> {
        ironfish::keys::OutgoingViewKey::from_words(lang.language_code().as_ref(), words)
            .map(|key| key.into())
            .map_err(|err| err.into())
    }

    #[wasm_bindgen(js_name = toWords)]
    pub fn to_words(&self, lang: Language) -> String {
        // `words_key()` may fail only if the language code is invalid, but here we're accepting
        // `Language`, not an arbitrary input, so the language code is guaranteed to be valid.
        self.0
            .words_key(lang.language_code().as_ref())
            .expect("conversion to words failed")
    }
}

wasm_bindgen_wrapper! {
    #[derive(Clone, PartialEq, Eq, Debug)]
    pub struct ViewKey(ironfish::keys::ViewKey);
}

#[wasm_bindgen]
impl ViewKey {
    #[wasm_bindgen(constructor)]
    pub fn deserialize(bytes: &[u8]) -> Result<Self, IronfishError> {
        Ok(Self(ironfish::keys::ViewKey::read(bytes)?))
    }

    #[wasm_bindgen]
    pub fn serialize(&self) -> Vec<u8> {
        self.0.to_bytes().to_vec()
    }

    #[wasm_bindgen(js_name = fromHex)]
    pub fn from_hex(hex: &str) -> Result<Self, IronfishError> {
        Ok(Self(ironfish::keys::ViewKey::from_hex(hex)?))
    }

    #[wasm_bindgen(js_name = toHex)]
    pub fn to_hex(&self) -> String {
        self.0.hex_key()
    }

    #[wasm_bindgen(getter, js_name = publicAddress)]
    pub fn public_address(&self) -> Result<PublicAddress, IronfishError> {
        self.0
            .public_address()
            .map(|a| a.into())
            .map_err(|e| e.into())
    }

    #[wasm_bindgen(getter, js_name = authorizingKey)]
    pub fn authorizing_key(&self) -> PublicKey {
        self.0.authorizing_key.into()
    }

    #[wasm_bindgen(getter, js_name = nullifierDerivingKey)]
    pub fn nullifier_deriving_key(&self) -> PublicKey {
        self.0.nullifier_deriving_key.into()
    }

    #[wasm_bindgen(js_name = randomizedPublicKeyPair)]
    pub fn randomized_public_key_pair(&self) -> RandomizedPublicKeyPair {
        let (r, s) = self.0.randomized_public_key(thread_rng());
        RandomizedPublicKeyPair::new(r.into(), s.into())
    }
}

#[wasm_bindgen]
#[derive(Clone, Debug)]
pub struct RandomizedPublicKeyPair(Fr, PublicKey);

#[wasm_bindgen]
impl RandomizedPublicKeyPair {
    #[wasm_bindgen(constructor)]
    pub fn new(public_key_randomness: Fr, randomized_public_key: PublicKey) -> Self {
        Self(public_key_randomness, randomized_public_key)
    }

    #[wasm_bindgen(js_name = fromViewKey)]
    pub fn from_view_key(view_key: &ViewKey) -> Self {
        let public_key_randomness = Fr::random();
        Self::from_view_key_and_randomness(view_key, public_key_randomness)
    }

    #[wasm_bindgen(js_name = fromViewKeyAndRandomness)]
    pub fn from_view_key_and_randomness(view_key: &ViewKey, public_key_randomness: Fr) -> Self {
        let randomized_public_key = view_key
            .authorizing_key()
            .randomize(&public_key_randomness, &(*SPENDING_KEY_GENERATOR).into());
        Self(public_key_randomness, randomized_public_key)
    }

    #[wasm_bindgen(js_name = publicKeyRandomness)]
    pub fn public_key_randomness(&self) -> Fr {
        self.0
    }

    #[wasm_bindgen(js_name = randomizedPublicKey)]
    pub fn randomized_public_key(&self) -> PublicKey {
        self.1.clone()
    }
}
