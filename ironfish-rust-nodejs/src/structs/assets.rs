use ironfish_rust::{
    primitives::asset_type::AssetInfo,
    proofs::notes::{create_asset_note::CreateAssetNote, mint_asset_note::MintAssetNote},
    PublicAddress,
};
use napi::{bindgen_prelude::BigInt, Error};
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

#[napi(js_name = "MintAssetNote")]
pub struct NativeMintAssetNote {
    pub(crate) inner: MintAssetNote,
}

#[napi]
impl NativeMintAssetNote {
    #[napi(constructor)]
    pub fn new(asset_info: &NativeAssetInfo, value: BigInt) -> Self {
        let note = MintAssetNote::new(asset_info.inner, value.get_u64().1);
        Self { inner: note }
    }
}
