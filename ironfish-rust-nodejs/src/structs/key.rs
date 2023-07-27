use ironfish::{IncomingViewKey, serializing::{bytes_to_hex, hex_to_bytes}};
use napi_derive::napi;
use napi::bindgen_prelude::*;

use crate::to_napi_err;


#[napi(js_name = "IncomingViewKey")]
pub struct Incoming {
    pub(crate) key: IncomingViewKey,
}

#[napi]
impl Incoming {
    #[napi(constructor)]
    pub fn new(hex: String) -> Result<Self> {
        let key = IncomingViewKey::from_hex(&hex).map_err(to_napi_err)?;
        Ok(Incoming {
            key,
        })
    }
    
    #[napi]
    pub fn shared_secret_key(&self, ephermal_public_key: String) -> Result<String> {
        let bytes = hex_to_bytes(&ephermal_public_key).map_err(to_napi_err)?;
        let key = self.key.shared_secret_key(bytes).map_err(to_napi_err)?;
        Ok(bytes_to_hex(&key))
    }

}