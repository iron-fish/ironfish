/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use std::io;

use ironfish_frost::frost::{frost::round1::NonceCommitment, Identifier, JubjubBlake2b512};

use crate::errors::IronfishError;

const SIGNING_COMMITMENT_LENGTH: usize = 96;

#[derive(Clone)]
pub struct SigningCommitment {
    pub identifier: Identifier,

    pub hiding: NonceCommitment<JubjubBlake2b512>,

    pub binding: NonceCommitment<JubjubBlake2b512>,
}

impl SigningCommitment {
    pub fn serialize(&self) -> [u8; SIGNING_COMMITMENT_LENGTH] {
        let mut bytes = [0u8; SIGNING_COMMITMENT_LENGTH];
        self.write(&mut bytes[..]).unwrap();
        bytes
    }

    pub fn read<R: io::Read>(mut reader: R) -> Result<Self, IronfishError> {
        let mut identifier = [0u8; 32];
        reader.read_exact(&mut identifier)?;
        let identifier = Identifier::deserialize(&identifier)?;

        let mut hiding = [0u8; 32];
        reader.read_exact(&mut hiding)?;
        let hiding = NonceCommitment::deserialize(hiding)?;

        let mut binding = [0u8; 32];
        reader.read_exact(&mut binding)?;
        let binding = NonceCommitment::deserialize(binding)?;

        Ok(SigningCommitment {
            identifier,
            hiding,
            binding,
        })
    }

    fn write<W: io::Write>(&self, mut writer: W) -> Result<(), IronfishError> {
        writer.write_all(&self.identifier.serialize())?;
        writer.write_all(&self.hiding.serialize())?;
        writer.write_all(&self.binding.serialize())?;
        Ok(())
    }
}
