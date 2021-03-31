/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

//! Lightweight wrapper of 32 byte nullifiers, which can be stored in a merkle_notes Merkle Tree.

pub type Nullifier = [u8; 32];
