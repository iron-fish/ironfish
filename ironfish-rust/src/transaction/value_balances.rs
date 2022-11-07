/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
use std::collections::{hash_map, HashMap};

use crate::assets::asset::{AssetIdentifier, NATIVE_ASSET};

pub struct ValueBalances {
    values: HashMap<AssetIdentifier, i64>,
}

impl ValueBalances {
    pub fn add(&mut self, asset_identifier: &AssetIdentifier, value: i64) {
        let current_value = self.values.entry(*asset_identifier).or_insert(0);
        *current_value += value
    }

    pub fn subtract(&mut self, asset_identifier: &AssetIdentifier, value: i64) {
        let current_value = self.values.entry(*asset_identifier).or_insert(0);
        *current_value -= value
    }

    pub fn iter(&self) -> hash_map::Iter<AssetIdentifier, i64> {
        self.values.iter()
    }

    pub fn fee(&self) -> &i64 {
        self.values.get(&NATIVE_ASSET).unwrap()
    }
}

impl Default for ValueBalances {
    fn default() -> Self {
        let mut hash_map = HashMap::default();

        hash_map.insert(NATIVE_ASSET, 0);

        ValueBalances { values: hash_map }
    }
}
