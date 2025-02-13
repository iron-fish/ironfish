/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::{errors::IronfishError, wasm_bindgen_wrapper};
use group::ff::Field;
use group::GroupEncoding;
use ironfish::errors::IronfishErrorKind;
use ironfish_zkp::redjubjub;
use rand::thread_rng;
use wasm_bindgen::prelude::*;

wasm_bindgen_wrapper! {
    #[derive(Default, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Debug)]
    pub struct Scalar(blstrs::Scalar);
}

#[wasm_bindgen]
impl Scalar {
    #[wasm_bindgen]
    pub fn zero() -> Self {
        Self(blstrs::Scalar::zero())
    }

    #[wasm_bindgen]
    pub fn random() -> Self {
        Self(blstrs::Scalar::random(thread_rng()))
    }

    #[wasm_bindgen(js_name = toBytesBe)]
    pub fn to_bytes_be(&self) -> Vec<u8> {
        self.0.to_bytes_be().to_vec()
    }

    #[wasm_bindgen(js_name = toBytesLe)]
    pub fn to_bytes_le(&self) -> Vec<u8> {
        self.0.to_bytes_le().to_vec()
    }
}

wasm_bindgen_wrapper! {
    #[derive(Default, Copy, Clone, PartialEq, Eq, Debug)]
    pub struct Fr(ironfish_jubjub::Fr);
}

#[wasm_bindgen]
impl Fr {
    #[wasm_bindgen]
    pub fn random() -> Self {
        Self(ironfish_jubjub::Fr::random(thread_rng()))
    }

    #[wasm_bindgen(js_name = fromBytes)]
    pub fn from_bytes(&self, bytes: &[u8]) -> Option<Self> {
        let bytes: &[u8; 32] = bytes.try_into().ok()?;
        let fr = Option::from(ironfish_jubjub::Fr::from_bytes(bytes))?;
        Some(Self(fr))
    }

    #[wasm_bindgen(js_name = toBytes)]
    pub fn to_bytes(&self) -> Vec<u8> {
        self.0.to_bytes().to_vec()
    }
}

wasm_bindgen_wrapper! {
    #[derive(Default, Copy, Clone, PartialEq, Eq, Debug)]
    pub struct ExtendedPoint(ironfish_jubjub::ExtendedPoint);
}

#[wasm_bindgen]
impl ExtendedPoint {
    #[wasm_bindgen(js_name = toBytes)]
    pub fn to_bytes(&self) -> Vec<u8> {
        self.0.to_bytes().to_vec()
    }
}

wasm_bindgen_wrapper! {
    #[derive(Default, Copy, Clone, PartialEq, Eq, Debug)]
    pub struct SubgroupPoint(ironfish_jubjub::SubgroupPoint);
}

#[wasm_bindgen]
impl SubgroupPoint {
    #[wasm_bindgen(js_name = toBytes)]
    pub fn to_bytes(&self) -> Vec<u8> {
        self.0.to_bytes().to_vec()
    }
}

wasm_bindgen_wrapper! {
    #[derive(Copy, Clone, PartialEq, Eq, Debug)]
    pub struct Nullifier(ironfish_zkp::Nullifier);
}

#[wasm_bindgen]
impl Nullifier {
    #[wasm_bindgen(js_name = toBytes)]
    pub fn to_bytes(&self) -> Vec<u8> {
        self.0.to_vec()
    }
}

wasm_bindgen_wrapper! {
    pub struct PrivateKey(redjubjub::PrivateKey);
}

#[wasm_bindgen]
impl PrivateKey {
    #[wasm_bindgen(constructor)]
    pub fn deserialize(bytes: &[u8]) -> Result<Self, IronfishError> {
        let s = redjubjub::PrivateKey::read(bytes)?;
        Ok(Self::from(s))
    }

    #[wasm_bindgen]
    pub fn serialize(&self) -> Vec<u8> {
        let mut buf = Vec::new();
        self.0.write(&mut buf).expect("serialization failed");
        buf
    }

    #[wasm_bindgen]
    pub fn randomize(&self, alpha: &Fr) -> Self {
        self.0.randomize(*alpha.as_ref()).into()
    }

    #[wasm_bindgen]
    pub fn sign(&self, msg: &[u8], p_g: &SubgroupPoint) -> Signature {
        self.0.sign(msg, &mut thread_rng(), *p_g.as_ref()).into()
    }

    #[wasm_bindgen(js_name = toPublicKey)]
    pub fn to_public_key(&self, p_g: &SubgroupPoint) -> PublicKey {
        redjubjub::PublicKey::from_private(self.as_ref(), *p_g.as_ref()).into()
    }
}

wasm_bindgen_wrapper! {
    #[derive(Clone, Debug)]
    pub struct PublicKey(redjubjub::PublicKey);
}

#[wasm_bindgen]
impl PublicKey {
    #[wasm_bindgen(constructor)]
    pub fn deserialize(bytes: &[u8]) -> Result<Self, IronfishError> {
        let s = redjubjub::PublicKey::read(bytes)?;
        Ok(Self::from(s))
    }

    #[wasm_bindgen]
    pub fn serialize(&self) -> Vec<u8> {
        let mut buf = Vec::new();
        self.0.write(&mut buf).expect("serialization failed");
        buf
    }

    #[wasm_bindgen]
    pub fn randomize(&self, alpha: &Fr, p_g: &SubgroupPoint) -> Self {
        self.0.randomize(*alpha.as_ref(), *p_g.as_ref()).into()
    }

    #[wasm_bindgen]
    pub fn verify(
        &self,
        msg: &[u8],
        sig: &Signature,
        p_g: &SubgroupPoint,
    ) -> Result<(), IronfishError> {
        self.0
            .verify(msg, sig.as_ref(), *p_g.as_ref())
            .then_some(())
            .ok_or_else(|| IronfishErrorKind::InvalidSignature.into())
    }
}

impl From<ironfish_jubjub::ExtendedPoint> for PublicKey {
    fn from(p: ironfish_jubjub::ExtendedPoint) -> Self {
        Self(redjubjub::PublicKey(p))
    }
}

impl From<ironfish_jubjub::SubgroupPoint> for PublicKey {
    fn from(p: ironfish_jubjub::SubgroupPoint) -> Self {
        Self(redjubjub::PublicKey(p.into()))
    }
}

wasm_bindgen_wrapper! {
    #[derive(Clone, Debug)]
    pub struct Signature(redjubjub::Signature);
}

#[wasm_bindgen]
impl Signature {
    #[wasm_bindgen(constructor)]
    pub fn deserialize(bytes: &[u8]) -> Result<Self, IronfishError> {
        let s = redjubjub::Signature::read(bytes)?;
        Ok(Self::from(s))
    }

    #[wasm_bindgen]
    pub fn serialize(&self) -> Vec<u8> {
        let mut buf = Vec::new();
        self.0.write(&mut buf).expect("serialization failed");
        buf
    }
}

wasm_bindgen_wrapper! {
    #[derive(Clone, PartialEq, Debug)]
    pub struct Proof(ironfish_bellperson::groth16::Proof<blstrs::Bls12>);
}

#[wasm_bindgen]
impl Proof {
    #[wasm_bindgen(constructor)]
    pub fn deserialize(bytes: &[u8]) -> Result<Self, IronfishError> {
        let s = ironfish_bellperson::groth16::Proof::read(bytes)?;
        Ok(Self::from(s))
    }

    #[wasm_bindgen]
    pub fn serialize(&self) -> Vec<u8> {
        let mut buf = Vec::new();
        self.0.write(&mut buf).expect("serialization failed");
        buf
    }
}
