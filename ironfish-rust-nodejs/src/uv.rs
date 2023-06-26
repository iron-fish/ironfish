/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use libuv_sys2::uv_loop_s;
use napi::{bindgen_prelude::*, Env};
use napi_derive::napi;

use crate::to_napi_err;

/// # Safety: This transmutes a pointer from a napi type to a libuv_sys2 type.
/// This function returns the number of requests waiting for libuv to handle
/// them. This is basically a queue size for the libuv thread pool.
#[napi]
pub unsafe fn get_uv_active_reqs(env: Env) -> Result<u32> {
    let napi_event_loop = env
        .get_uv_event_loop()
        .map_err(|e| to_napi_err(format!("Error getting NAPI event loop: {:?}", e)))?;
    let uv_loop = napi_event_loop as *mut uv_loop_s;

    Ok((*uv_loop).active_reqs.count)
}
