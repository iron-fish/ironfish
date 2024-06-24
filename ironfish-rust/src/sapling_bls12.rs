/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::Sapling;
use lazy_static::lazy_static;

pub use blstrs::Scalar;

// Loads the Sapling object once when dereferenced,
// then reuses the reference on future calls.
lazy_static! {
    pub static ref SAPLING: Sapling = Sapling::load();
}
