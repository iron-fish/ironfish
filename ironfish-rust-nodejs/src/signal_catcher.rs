/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use ironfish::signal_catcher::{init_signal_handler, trigger_segfault};
use napi_derive::napi;

/// # Safety
/// This is unsafe, it calls libc functions
#[napi(js_name = "initSignalHandler")]
pub unsafe fn native_init_signal_handler() {
    init_signal_handler()
}

/// # Safety
/// This is unsafe, it intentionally crashes
#[napi(js_name = "triggerSegfault")]
pub unsafe fn native_trigger_segfault() {
    trigger_segfault()
}
