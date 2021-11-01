/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use wasm_bindgen::prelude::*;

use std::panic;

#[wasm_bindgen]
extern "C" {
    type Error;

    #[wasm_bindgen(constructor)]
    fn new() -> Error;

    #[wasm_bindgen(structural, method, getter)]
    fn stack(error: &Error) -> String;
}

fn hook_impl(info: &panic::PanicInfo) {
    let e = Error::new();
    let stack = e.stack();

    let er = js_sys::Error::new(&info.to_string());
    let _ = js_sys::Reflect::set(&er, &"stack".into(), &stack.into());

    wasm_bindgen::throw_val(er.into());
}

pub fn hook(info: &panic::PanicInfo) {
    hook_impl(info);
}

#[inline]
pub fn set_once() {
    use std::sync::Once;
    static SET_HOOK: Once = Once::new();
    SET_HOOK.call_once(|| {
        panic::set_hook(Box::new(hook));
    });
}
