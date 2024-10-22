/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use group::GroupEncoding;
use ironfish_jubjub::Fr;
use ironfish_zkp::{constants::SPENDING_KEY_GENERATOR, redjubjub};

use crate::{errors::IronfishError, ViewKey};

pub fn generate_randomized_public_key(
    view_key: ViewKey,
    public_key_randomness: Fr,
) -> Result<[u8; 32], IronfishError> {
    let randomized_public_key = redjubjub::PublicKey(view_key.authorizing_key.into())
        .randomize(public_key_randomness, *SPENDING_KEY_GENERATOR);

    Ok(randomized_public_key.0.to_bytes())
}
