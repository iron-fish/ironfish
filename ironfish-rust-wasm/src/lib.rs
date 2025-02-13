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
pub mod circuits;
pub mod errors;
pub mod keys;
pub mod merkle_note;
pub mod note;
pub mod primitives;
pub mod transaction;
pub mod witness;

/// Creates a [`wasm_bindgen`] wrapper for an existing type.
///
/// This macro can be invoked as follows:
///
/// ```
/// wasm_bindgen_wrapper! {
///     #[derive(Clone, Debug)]
///     pub struct FooBinding(Foo);
/// }
/// ```
///
/// and expands to the following:
///
/// ```
/// #[wasm_bindgen]
/// #[derive(Clone, Debug)]
/// pub struct FooBinding(Foo);
///
/// impl From<Foo> for FooBinding { ... }
/// impl From<FooBinding> for Foo { ... }
/// impl AsRef<Foo> for FooBinding { ... }
/// impl Borrow<Foo> for FooBinding { ... }
/// ```
macro_rules! wasm_bindgen_wrapper {
    ($(
        $( #[ $meta:meta ] )*
        $vis:vis struct $name:ident ( $inner:ty ) ;
    )*) => {$(
        $(#[$meta])*
        #[::wasm_bindgen::prelude::wasm_bindgen]
        $vis struct $name($inner);

        impl ::std::convert::From<$inner> for $name {
            fn from(x: $inner) -> Self {
                Self(x)
            }
        }

        impl ::std::convert::From<$name> for $inner {
            fn from(x: $name) -> Self {
                x.0
            }
        }

        impl ::std::convert::AsRef<$inner> for $name {
            fn as_ref(&self) -> &$inner {
                &self.0
            }
        }

        impl ::std::borrow::Borrow<$inner> for $name {
            fn borrow(&self) -> &$inner {
                &self.0
            }
        }
    )*}
}

use wasm_bindgen_wrapper;

#[cfg(test)]
mod tests {
    wasm_bindgen_test::wasm_bindgen_test_configure!(run_in_browser);
}
