/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::{
    errors::IronfishError,
    keys::PublicAddress,
    primitives::{ExtendedPoint, SubgroupPoint},
    wasm_bindgen_wrapper,
};
use ironfish::errors::IronfishErrorKind;
use wasm_bindgen::prelude::*;

wasm_bindgen_wrapper! {
    #[derive(Clone, PartialEq, Eq, Debug)]
    pub struct Asset(ironfish::assets::asset::Asset);
}

#[wasm_bindgen]
impl Asset {
    #[wasm_bindgen(constructor)]
    pub fn deserialize(bytes: &[u8]) -> Result<Asset, IronfishError> {
        Ok(Self(ironfish::assets::asset::Asset::read(bytes)?))
    }

    #[wasm_bindgen]
    pub fn serialize(&self) -> Vec<u8> {
        let mut buf = Vec::new();
        self.0.write(&mut buf).expect("failed to serialize asset");
        buf
    }

    #[wasm_bindgen(js_name = fromParts)]
    pub fn from_parts(
        creator: PublicAddress,
        name: &str,
        metadata: &str,
    ) -> Result<Self, IronfishError> {
        Ok(Self(ironfish::assets::asset::Asset::new(
            creator.as_ref().to_owned(),
            name,
            metadata,
        )?))
    }

    #[wasm_bindgen(js_name = fromPartsWithNonce)]
    pub fn from_parts_with_nonce(
        creator: PublicAddress,
        name: &[u8],
        metadata: &[u8],
        nonce: u8,
    ) -> Result<Self, IronfishError> {
        let name = name
            .try_into()
            .map_err(|_| IronfishErrorKind::InvalidData)?;
        let metadata = metadata
            .try_into()
            .map_err(|_| IronfishErrorKind::InvalidData)?;
        Ok(Self(ironfish::assets::asset::Asset::new_with_nonce(
            creator.as_ref().to_owned(),
            name,
            metadata,
            nonce,
        )?))
    }

    #[wasm_bindgen(getter)]
    pub fn metadata(&self) -> Vec<u8> {
        self.0.metadata().to_vec()
    }

    #[wasm_bindgen(getter)]
    pub fn name(&self) -> Vec<u8> {
        self.0.name().to_vec()
    }

    #[wasm_bindgen(getter)]
    pub fn nonce(&self) -> u8 {
        self.0.nonce()
    }

    #[wasm_bindgen(getter)]
    pub fn creator(&self) -> PublicAddress {
        PublicAddress::deserialize(self.0.creator().as_slice())
            .expect("failed to deserialize public address")
    }

    #[wasm_bindgen(getter)]
    pub fn id(&self) -> AssetIdentifier {
        self.0.id().to_owned().into()
    }

    #[wasm_bindgen(getter, js_name = assetGenerator)]
    pub fn asset_generator(&self) -> ExtendedPoint {
        self.0.asset_generator().into()
    }

    #[wasm_bindgen(getter, js_name = valueCommitmentGenerator)]
    pub fn value_commitment_generator(&self) -> SubgroupPoint {
        self.0.value_commitment_generator().into()
    }
}

wasm_bindgen_wrapper! {
    #[derive(Clone, PartialEq, Eq, Debug)]
    pub struct AssetIdentifier(ironfish::assets::asset_identifier::AssetIdentifier);
}

#[wasm_bindgen]
impl AssetIdentifier {
    #[wasm_bindgen(constructor)]
    pub fn deserialize(bytes: &[u8]) -> Result<AssetIdentifier, IronfishError> {
        Ok(Self(
            ironfish::assets::asset_identifier::AssetIdentifier::read(bytes)?,
        ))
    }

    #[wasm_bindgen]
    pub fn serialize(&self) -> Vec<u8> {
        self.0.as_bytes().to_vec()
    }

    #[wasm_bindgen(getter)]
    pub fn native() -> Self {
        Self(ironfish::assets::asset_identifier::NATIVE_ASSET)
    }

    #[wasm_bindgen(getter, js_name = assetGenerator)]
    pub fn asset_generator(&self) -> ExtendedPoint {
        self.0.asset_generator().into()
    }

    #[wasm_bindgen(getter, js_name = valueCommitmentGenerator)]
    pub fn value_commitment_generator(&self) -> SubgroupPoint {
        self.0.value_commitment_generator().into()
    }
}

#[cfg(test)]
mod tests {
    mod asset {
        use crate::{assets::Asset, keys::PublicAddress};
        use hex_literal::hex;
        use wasm_bindgen_test::wasm_bindgen_test;

        fn test_address() -> PublicAddress {
            PublicAddress::deserialize(
                hex!("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0").as_slice(),
            )
            .unwrap()
        }

        fn test_asset() -> Asset {
            let asset = Asset::from_parts(test_address(), "name", "meta").unwrap();

            assert_eq!(asset.creator(), test_address());
            assert_eq!(
                asset.name(),
                b"name\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0"
            );
            assert_eq!(
                asset.metadata(),
                b"meta\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\
                \0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\
                \0\0\0\0\0\0\0\0\0\0\0\0\0"
            );
            assert_eq!(
                asset.id().serialize(),
                hex!("2b845f8f97b90d2279bf502eb3ebdf71bf47460b083ca926421b0c7ee68ec816")
            );

            asset
        }

        #[test]
        #[wasm_bindgen_test]
        fn serialize_deserialize_roundtrip() {
            let asset = test_asset();

            let serialization = asset.serialize();
            let deserialized = Asset::deserialize(&serialization[..]).unwrap();

            assert_eq!(asset, deserialized);
            assert_eq!(serialization, deserialized.serialize());
        }

        #[test]
        #[wasm_bindgen_test]
        fn from_parts_with_nonce() {
            let asset = Asset::from_parts_with_nonce(
                test_address(),
                b"name\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0",
                b"meta\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\
                \0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\
                \0\0\0\0\0\0\0\0\0\0\0\0\0",
                0,
            )
            .unwrap();
            assert_eq!(asset, test_asset());
        }
    }

    mod asset_identifier {
        use crate::assets::AssetIdentifier;
        use hex_literal::hex;
        use wasm_bindgen_test::wasm_bindgen_test;

        #[test]
        #[wasm_bindgen_test]
        fn serialize_deserialize_roundtrip() {
            let serialization =
                hex!("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb1");
            let id = AssetIdentifier::deserialize(&serialization[..]).unwrap();
            assert_eq!(id.serialize(), serialization);
        }

        #[test]
        #[wasm_bindgen_test]
        fn native() {
            let id = AssetIdentifier::native();
            assert_eq!(
                id.serialize(),
                hex!("51f33a2f14f92735e562dc658a5639279ddca3d5079a6d1242b2a588a9cbf44c")
            );
        }
    }
}
