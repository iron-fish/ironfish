use std::collections::HashMap;

use napi_derive::napi;

#[napi(object)]
pub struct TrustedDealerKeyPackages {
    pub verifying_key: String,
    pub proof_generation_key: String,
    pub view_key: String,
    pub incoming_view_key: String,
    pub outgoing_view_key: String,
    pub public_address: String,
    pub key_packages: HashMap<String, String>,
    pub public_key_package: String,
}
