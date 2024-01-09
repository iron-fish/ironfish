/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use napi_derive::napi;
use std::collections::HashMap;

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
