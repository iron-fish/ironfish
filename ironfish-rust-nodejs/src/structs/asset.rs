/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use ironfish_rust::assets::asset::{Asset, ASSET_LENGTH};
use napi::{
    bindgen_prelude::{Buffer, Result},
    JsBuffer,
};
use napi_derive::napi;

use crate::to_napi_err;

#[napi(js_name = "ASSET_LENGTH")]
pub const NATIVE_ASSET_LENGTH: u32 = ASSET_LENGTH as u32;

#[napi(js_name = "Asset")]
pub struct NativeAsset {
    pub(crate) asset: Asset,
}

#[napi]
impl NativeAsset {
    #[napi(constructor)]
    pub fn new(js_bytes: JsBuffer) -> Result<NativeAsset> {
        let bytes = js_bytes.into_value()?;
        let asset = Asset::read(bytes.as_ref()).map_err(to_napi_err)?;

        Ok(NativeAsset { asset })
    }

    #[napi]
    pub fn serialize(&self) -> Result<Buffer> {
        let mut vec: Vec<u8> = vec![];
        self.asset.write(&mut vec).map_err(to_napi_err)?;

        Ok(Buffer::from(vec))
    }
}
