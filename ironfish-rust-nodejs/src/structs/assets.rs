use ironfish_rust::{
    notes::create_asset_note::CreateAssetNote, primitives::asset_type::AssetInfo, PublicAddress,
};
use napi::{
    bindgen_prelude::{BigInt, Buffer},
    Error,
};
use napi_derive::napi;

#[napi(js_name = "AssetInfo")]
pub struct NativeAssetInfo {
    pub(crate) inner: AssetInfo,
}

#[napi]
impl NativeAssetInfo {
    #[napi(constructor)]
    pub fn new(name: String, public_address_string: String) -> napi::Result<Self> {
        let public_address = PublicAddress::from_hex(&public_address_string).map_err(|_| {
            Error::from_reason("Unable to create public address from hex".to_owned())
        })?;

        let asset_info = AssetInfo::new(&name, public_address)
            .map_err(|_| Error::from_reason("Unable to create valid asset info".to_owned()))?;

        Ok(NativeAssetInfo { inner: asset_info })
    }

    #[napi]
    pub fn asset_type(&self) -> napi::Result<Buffer> {
        Ok(self.inner.asset_type().get_identifier().to_vec().into())
    }
}

#[napi(js_name = "CreateAssetNote")]
pub struct NativeCreateAssetNote {
    pub(crate) inner: CreateAssetNote,
}

#[napi]
impl NativeCreateAssetNote {
    #[napi(constructor)]
    pub fn new(asset_info: &NativeAssetInfo) -> Self {
        let note = CreateAssetNote::new(asset_info.inner);

        Self { inner: note }
    }
}
