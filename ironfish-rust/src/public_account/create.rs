/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use ed25519_dalek::{Signature, VerifyingKey, Verifier};
use std::io;

use crate::errors::{IronfishError, IronfishErrorKind};


#[derive(Clone)]
pub struct PublicAccountCreateDescription {
    /// TODO(jwp): do we need a separate account address for later migration
    /// pub(crate) account_address: EthereumAddress

    // Minimum number of required signers
    pub(crate) threshold: i16,
    // Signers of the public account
    pub(crate) signers: Vec<VerifyingKey>,
    // TODO(jwp): do we need to include signatures for create?
    pub(crate) signatures: Vec<Signature>,
}

impl PublicAccountCreateDescription {
    pub fn read<R: io::Read>(mut reader: R) -> Result<Self, IronfishError> {
        let mut threshold_buf = [0; 1];
        reader.read_exact(&mut threshold_buf)?;
        let threshold = threshold_buf[0] as i16;

        let mut signers_len_buf = [0; 2];
        reader.read_exact(&mut signers_len_buf)?;
        let signers_len = i16::from_le_bytes(signers_len_buf) as usize;

        let mut signers = Vec::with_capacity(signers_len);
        for _ in 0..signers_len {
            let mut signer_buf = [0; 32];
            reader.read_exact(&mut signer_buf)?;
            let signer = VerifyingKey::from_bytes(&signer_buf)
                .map_err(|_| IronfishError::new(IronfishErrorKind::InvalidData))?;
            signers.push(signer);
        }

        let mut signatures_len_buf = [0; 2];
        reader.read_exact(&mut signatures_len_buf)?;
        let signatures_len = i16::from_le_bytes(signatures_len_buf) as usize;

        let mut signatures = Vec::with_capacity(signatures_len);
        for _ in 0..signatures_len {
            let mut signature_buf = [0; 64];
            reader.read_exact(&mut signature_buf)?;
            let signature = Signature::from_bytes(&signature_buf);
            signatures.push(signature);
        }

        Ok(Self { threshold, signers, signatures })
    }

    pub fn write<W: io::Write>(&self, mut writer: W) -> Result<(), IronfishError> {
        writer.write_all(&self.threshold.to_le_bytes())?;

        let signers_len = self.signers.len() as i16;
        writer.write_all(&signers_len.to_le_bytes())?;

        for signer in &self.signers {
            writer.write_all(signer.as_bytes())?;
        }

        let signatures_len = self.signatures.len() as i16;
        writer.write_all(&signatures_len.to_le_bytes())?;

        for signature in &self.signatures {
            writer.write_all(&signature.to_bytes())?;
        }

        Ok(())
    }

    pub fn verify(&self) -> Result<(), IronfishError> {
        if self.threshold < 1 {
            return Err(IronfishError::new(IronfishErrorKind::InvalidData));
        }

        if self.signers.len() < self.threshold as usize {
            return Err(IronfishError::new(IronfishErrorKind::InvalidData));
        }

        if self.signatures.len() < self.threshold as usize {
            return Err(IronfishError::new(IronfishErrorKind::InvalidData));
        }

        // verify signatures
        let is_valid = self.signers.iter().zip(&self.signatures).any(|(signer, signature)| {
            signer.verify(&self.hash(), signature).is_ok()
        });
        if !is_valid {
            return Err(IronfishError::new(IronfishErrorKind::InvalidSignature));
        }


        Ok(())
    }

    pub fn hash(&self) -> [u8; 32] {
        // TODO(jwp): verify which hashers supported by axelar
        let mut hasher = blake3::Hasher::new();
        hasher.update(&self.threshold.to_le_bytes());
        for signer in &self.signers {
            hasher.update(signer.as_bytes());
        }
        hasher.finalize().into()
    }
}
