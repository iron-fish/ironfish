/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

pub mod aead;
pub mod fr;
use crate::errors::{IronfishError, IronfishErrorKind};
pub use ironfish_zkp::hex::{bytes_to_hex, hex_to_bytes, hex_to_vec_bytes};

/// Helper functions to convert pairing parts to bytes
///
/// The traits in the pairing and zcash_primitives libraries
/// all have functions for serializing, but their interface
/// can be a bit clunky if you're just working with bytearrays.
use ff::PrimeField;
use group::GroupEncoding;

use std::io;

pub(crate) fn read_scalar<F: PrimeField, R: io::Read>(mut reader: R) -> Result<F, IronfishError> {
    let mut fr_repr = F::Repr::default();
    reader.read_exact(fr_repr.as_mut())?;

    Option::from(F::from_repr(fr_repr))
        .ok_or_else(|| IronfishError::new(IronfishErrorKind::InvalidData))
}

pub(crate) fn read_point<G: GroupEncoding, R: io::Read>(mut reader: R) -> Result<G, IronfishError> {
    let mut point_repr = G::Repr::default();
    reader.read_exact(point_repr.as_mut())?;

    Option::from(G::from_bytes(&point_repr))
        .ok_or_else(|| IronfishError::new(IronfishErrorKind::InvalidData))
}

pub(crate) fn read_point_unchecked<G: GroupEncoding, R: io::Read>(
    mut reader: R,
) -> Result<G, IronfishError> {
    let mut point_repr = G::Repr::default();
    reader.read_exact(point_repr.as_mut())?;

    Option::from(G::from_bytes_unchecked(&point_repr))
        .ok_or_else(|| IronfishError::new(IronfishErrorKind::InvalidData))
}
