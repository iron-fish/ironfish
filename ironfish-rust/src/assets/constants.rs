/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/// Length in bytes of the asset identifier
pub(crate) const ASSET_IDENTIFIER_LENGTH: usize = 32;

/// BLAKE2s personalization for deriving asset identifier from asset name
pub(crate) const ASSET_IDENTIFIER_PERSONALIZATION: &[u8; 8] = b"ironf_A_";
