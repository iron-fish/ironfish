/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use napi::bindgen_prelude::*;
use napi_derive::napi;

#[napi(object)]
pub struct NativeSpendProof {
    pub tree_size: u32,
    pub root_hash: Buffer,
    pub nullifier: Buffer,
}
