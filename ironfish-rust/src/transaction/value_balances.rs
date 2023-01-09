/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
use std::collections::{hash_map, HashMap};

use crate::{
    assets::asset::{AssetIdentifier, NATIVE_ASSET},
    errors::IronfishError,
};

pub struct ValueBalances {
    values: HashMap<AssetIdentifier, i64>,
}

impl ValueBalances {
    pub fn new() -> Self {
        let mut hash_map = HashMap::default();

        hash_map.insert(NATIVE_ASSET, 0);

        ValueBalances { values: hash_map }
    }

    pub fn add(&mut self, asset_id: &AssetIdentifier, value: i64) -> Result<(), IronfishError> {
        let current_value = self.values.entry(*asset_id).or_insert(0);
        let new_value = current_value
            .checked_add(value)
            .ok_or(IronfishError::InvalidBalance)?;

        *current_value = new_value;

        Ok(())
    }

    pub fn subtract(
        &mut self,
        asset_id: &AssetIdentifier,
        value: i64,
    ) -> Result<(), IronfishError> {
        let current_value = self.values.entry(*asset_id).or_insert(0);
        let new_value = current_value
            .checked_sub(value)
            .ok_or(IronfishError::InvalidBalance)?;

        *current_value = new_value;

        Ok(())
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

        vb.add(&NATIVE_ASSET, 5).unwrap();
        vb.subtract(&NATIVE_ASSET, 2).unwrap();

        assert_eq!(*vb.fee(), 3);
    }

    #[test]
    fn test_value_balances_multiple_assets() {
        let mut vb = ValueBalances::new();

        let asset_one = [1u8; 32];
        let asset_two = [2u8; 32];

        vb.add(&NATIVE_ASSET, 5).unwrap();
        vb.subtract(&NATIVE_ASSET, 3).unwrap();

        vb.add(&asset_one, 6).unwrap();
        vb.subtract(&asset_one, 2).unwrap();

        vb.subtract(&asset_two, 10).unwrap();

        assert_eq!(*vb.fee(), 2);
        assert_eq!(*vb.values.get(&asset_one).unwrap(), 4);
        assert_eq!(*vb.values.get(&asset_two).unwrap(), -10);
    }

    #[test]
    fn test_value_balances_checks_overflows_add() {
        let mut vb = ValueBalances::new();

        let asset = [1u8; 32];

        // First value add - does not overflow
        vb.add(&asset, i64::MAX - 1).unwrap();

        // Second value add - overflows
        assert!(vb.add(&asset, 100).is_err());
    }

    #[test]
    fn test_value_balances_checks_overflows_sub() {
        let mut vb = ValueBalances::new();

        let asset = [1u8; 32];

        // First value sub - does not overflow
        vb.subtract(&asset, i64::MAX - 1).unwrap();

        // Second value sub - overflows
        assert!(vb.subtract(&asset, 100).is_err());
    }
}
