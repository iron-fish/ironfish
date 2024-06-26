/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use ironfish::{
    assets::{
        asset::{
            Asset, ASSET_LENGTH as SERIALIZED_ASSET_LENGTH, ID_LENGTH, METADATA_LENGTH, NAME_LENGTH,
        },
        asset_identifier::NATIVE_ASSET,
    },
    PublicAddress,
};
use napi::{
    bindgen_prelude::{Buffer, Result},
    JsBuffer,
};
use napi_derive::napi;

use crate::to_napi_err;

#[napi]
pub const ASSET_ID_LENGTH: u32 = ID_LENGTH as u32;

#[napi]
pub const ASSET_METADATA_LENGTH: u32 = METADATA_LENGTH as u32;

#[napi]
pub const ASSET_NAME_LENGTH: u32 = NAME_LENGTH as u32;

#[napi]
pub const ASSET_LENGTH: u32 = SERIALIZED_ASSET_LENGTH as u32;

#[napi(js_name = "Asset")]
pub struct NativeAsset {
    pub(crate) asset: Asset,
}

#[napi]
impl NativeAsset {
    #[napi(constructor)]
    pub fn new(
        creator_public_address: String,
        name: String,
        metadata: String,
    ) -> Result<NativeAsset> {
        let public_address =
            PublicAddress::from_hex(&creator_public_address).map_err(to_napi_err)?;

        Ok(NativeAsset {
            asset: Asset::new(public_address, &name, &metadata).map_err(to_napi_err)?,
        })
    }

    #[napi]
    pub fn metadata(&self) -> Buffer {
        Buffer::from(self.asset.metadata())
    }

    #[napi]
    pub fn name(&self) -> Buffer {
        Buffer::from(self.asset.name())
    }

    #[napi]
    pub fn nonce(&self) -> u8 {
        self.asset.nonce()
    }

    #[napi]
    pub fn creator(&self) -> Buffer {
        Buffer::from(&self.asset.creator()[..])
    }

    #[napi]
    pub fn native_id() -> Buffer {
        Buffer::from(&NATIVE_ASSET.as_bytes()[..])
    }

    #[napi]
    pub fn id(&self) -> Buffer {
        Buffer::from(&self.asset.id().as_bytes()[..])
    }

    #[napi]
    pub fn serialize(&self) -> Result<Buffer> {
        let mut vec: Vec<u8> = vec![];
        self.asset.write(&mut vec).map_err(to_napi_err)?;

        Ok(Buffer::from(vec))
    }

    #[napi(factory)]
    pub fn deserialize(js_bytes: JsBuffer, skip_validation: Option<bool>) -> Result<Self> {
        let bytes = js_bytes.into_value()?;
        let skip_validation = skip_validation.unwrap_or(false);
        let asset = if !skip_validation {
            Asset::read(bytes.as_ref())
        } else {
            Asset::read_unchecked(bytes.as_ref())
        }
        .map_err(to_napi_err)?;

        Ok(NativeAsset { asset })
    }
}
