/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
use std::collections::{hash_map, HashMap};

use crate::assets::asset::{AssetIdentifier, NATIVE_ASSET};

pub struct ValueBalances {
    values: HashMap<AssetIdentifier, i64>,
}

impl ValueBalances {
    pub fn new() -> Self {
        let mut hash_map = HashMap::default();

        hash_map.insert(NATIVE_ASSET, 0);

        ValueBalances { values: hash_map }
    }

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

#[cfg(test)]
mod test {
    use crate::assets::asset::NATIVE_ASSET;

    use super::ValueBalances;

    #[test]
    fn test_value_balances_has_native_asset() {
        let vb = ValueBalances::new();

        let native_asset_value = vb.values.get(&NATIVE_ASSET);

        assert!(native_asset_value.is_some());
        assert_eq!(*native_asset_value.unwrap(), 0);
    }

    #[test]
    fn test_value_balances_fee() {
        let mut vb = ValueBalances::new();

        vb.add(&NATIVE_ASSET, 5);
        vb.subtract(&NATIVE_ASSET, 2);

        assert_eq!(*vb.fee(), 3);
    }

    #[test]
    fn test_value_balances_multiple_assets() {
        let mut vb = ValueBalances::new();

        let asset_two = [1u8; 32];
        let asset_three = [2u8; 32];

        vb.add(&NATIVE_ASSET, 5);
        vb.subtract(&NATIVE_ASSET, 3);

        vb.add(&asset_two, 6);
        vb.subtract(&asset_two, 2);

        vb.subtract(&asset_three, 10);

        assert_eq!(*vb.fee(), 2);
        assert_eq!(*vb.values.get(&asset_two).unwrap(), 4);
        assert_eq!(*vb.values.get(&asset_three).unwrap(), -10);
    }
}
