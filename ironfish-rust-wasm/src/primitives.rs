/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::errors::IronfishError;
use group::GroupEncoding;
use ironfish::errors::IronfishErrorKind;
use ironfish_zkp::redjubjub;
use rand::thread_rng;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
#[derive(Default, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Debug)]
pub struct Scalar(blstrs::Scalar);

#[wasm_bindgen]
impl Scalar {
    #[wasm_bindgen(js_name = toBytesBe)]
    pub fn to_bytes_be(&self) -> Vec<u8> {
        self.0.to_bytes_be().to_vec()
    }

    #[wasm_bindgen(js_name = toBytesLe)]
    pub fn to_bytes_le(&self) -> Vec<u8> {
        self.0.to_bytes_le().to_vec()
    }
}

impl From<blstrs::Scalar> for Scalar {
    fn from(s: blstrs::Scalar) -> Self {
        Self(s)
    }
}

impl AsRef<blstrs::Scalar> for Scalar {
    fn as_ref(&self) -> &blstrs::Scalar {
        &self.0
    }
}

#[wasm_bindgen]
#[derive(Default, Copy, Clone, PartialEq, Eq, Debug)]
pub struct Fr(ironfish_jubjub::Fr);

#[wasm_bindgen]
impl Fr {
    #[wasm_bindgen(js_name = toBytes)]
    pub fn to_bytes(&self) -> Vec<u8> {
        self.0.to_bytes().to_vec()
    }
}

impl From<ironfish_jubjub::Fr> for Fr {
    fn from(s: ironfish_jubjub::Fr) -> Self {
        Self(s)
    }
}

impl AsRef<ironfish_jubjub::Fr> for Fr {
    fn as_ref(&self) -> &ironfish_jubjub::Fr {
        &self.0
    }
}

#[wasm_bindgen]
#[derive(Default, Copy, Clone, PartialEq, Eq, Debug)]
pub struct ExtendedPoint(ironfish_jubjub::ExtendedPoint);

#[wasm_bindgen]
impl ExtendedPoint {
    #[wasm_bindgen(js_name = toBytes)]
    pub fn to_bytes(&self) -> Vec<u8> {
        self.0.to_bytes().to_vec()
    }
}

impl From<ironfish_jubjub::ExtendedPoint> for ExtendedPoint {
    fn from(s: ironfish_jubjub::ExtendedPoint) -> Self {
        Self(s)
    }
}

impl AsRef<ironfish_jubjub::ExtendedPoint> for ExtendedPoint {
    fn as_ref(&self) -> &ironfish_jubjub::ExtendedPoint {
        &self.0
    }
}

#[wasm_bindgen]
#[derive(Default, Copy, Clone, PartialEq, Eq, Debug)]
pub struct SubgroupPoint(ironfish_jubjub::SubgroupPoint);

#[wasm_bindgen]
impl SubgroupPoint {
    #[wasm_bindgen(js_name = toBytes)]
    pub fn to_bytes(&self) -> Vec<u8> {
        self.0.to_bytes().to_vec()
    }
}

impl From<ironfish_jubjub::SubgroupPoint> for SubgroupPoint {
    fn from(s: ironfish_jubjub::SubgroupPoint) -> Self {
        Self(s)
    }
}

impl AsRef<ironfish_jubjub::SubgroupPoint> for SubgroupPoint {
    fn as_ref(&self) -> &ironfish_jubjub::SubgroupPoint {
        &self.0
    }
}

#[wasm_bindgen]
#[derive(Copy, Clone, PartialEq, Eq, Debug)]
pub struct Nullifier(ironfish_zkp::Nullifier);

#[wasm_bindgen]
impl Nullifier {
    #[wasm_bindgen(js_name = toBytes)]
    pub fn to_bytes(&self) -> Vec<u8> {
        self.0.to_vec()
    }
}

impl From<ironfish_zkp::Nullifier> for Nullifier {
    fn from(s: ironfish_zkp::Nullifier) -> Self {
        Self(s)
    }
}

impl AsRef<ironfish_zkp::Nullifier> for Nullifier {
    fn as_ref(&self) -> &ironfish_zkp::Nullifier {
        &self.0
    }
}

#[wasm_bindgen]
pub struct PrivateKey(redjubjub::PrivateKey);

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

impl From<redjubjub::PrivateKey> for PrivateKey {
    fn from(p: redjubjub::PrivateKey) -> Self {
        Self(p)
    }
}

impl AsRef<redjubjub::PrivateKey> for PrivateKey {
    fn as_ref(&self) -> &redjubjub::PrivateKey {
        &self.0
    }
}

#[wasm_bindgen]
#[derive(Clone, Debug)]
pub struct PublicKey(redjubjub::PublicKey);

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

impl From<redjubjub::PublicKey> for PublicKey {
    fn from(p: redjubjub::PublicKey) -> Self {
        Self(p)
    }
}

impl AsRef<redjubjub::PublicKey> for PublicKey {
    fn as_ref(&self) -> &redjubjub::PublicKey {
        &self.0
    }
}

#[wasm_bindgen]
#[derive(Clone, Debug)]
pub struct Signature(redjubjub::Signature);

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

impl From<redjubjub::Signature> for Signature {
    fn from(s: redjubjub::Signature) -> Self {
        Self(s)
    }
}

impl AsRef<redjubjub::Signature> for Signature {
    fn as_ref(&self) -> &redjubjub::Signature {
        &self.0
    }
}
