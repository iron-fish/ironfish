/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
pub use bls12_381::Scalar;
use lazy_static::lazy_static;
use std::sync::Arc;

use crate::Sapling;

// Loads the Sapling object once when dereferenced,
// then reuses the reference on future calls.
lazy_static! {
    pub static ref SAPLING: Arc<Sapling> = Arc::new(load());
}

/// Load a sapling object configured to a BLS12 jubjub curve. This is currently
/// the only pairing for which a jubjub curve has been defined, and is the
/// default implementation.
///
/// Provided as a convenience method so clients don't have to depend
/// explicitly on zcash_primitives just to define a JubjubBls12 point.
fn load() -> Sapling {
    Sapling::load()
}
