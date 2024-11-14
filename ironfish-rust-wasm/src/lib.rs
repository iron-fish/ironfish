/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

#![warn(clippy::dbg_macro)]
#![warn(clippy::print_stderr)]
#![warn(clippy::print_stdout)]
#![warn(unreachable_pub)]
#![warn(unused_crate_dependencies)]
#![warn(unused_macro_rules)]
#![warn(unused_qualifications)]

// These dependencies exist only to ensure that some browser-specific features are enabled, and are
// not actually used in our code
use getrandom as _;
use rayon as _;

pub mod assets;
pub mod errors;
pub mod keys;
pub mod merkle_note;
pub mod primitives;
pub mod transaction;

#[cfg(test)]
mod tests {
    wasm_bindgen_test::wasm_bindgen_test_configure!(run_in_browser);
}
