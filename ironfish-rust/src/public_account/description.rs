/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use std::{collections::HashMap, io};

use crate::{
    errors::{IronfishError, IronfishErrorKind},
    PublicAddress,
};

use super::transfer::Transfer;
use std::collections::HashSet;

#[derive(Clone)]
pub struct PublicAccountDescription {
    /// TODO(jwp): do we need a separate account address for later migration
    /// pub(crate) account_address: EthereumAddress
    version: u8,
    // Minimum number of signers required to sign a message and be valid
    min_signers: u16,
    // Signers of the public account
    signers: Vec<VerifyingKey>,
    // Signatures of the signers for a given message
    signatures: Vec<Signature>,
    // asset transfers
    transfers: Vec<Transfer>,
    // address of the account
    address: PublicAddress,
}

impl PublicAccountDescription {
    pub fn new(
        version: u8,
        min_signers: u16,
        signers:impl IntoIterator<Item = VerifyingKey>,
        transfers: impl IntoIterator<Item = Transfer>,
        address: PublicAddress,
    ) -> Result<PublicAccountDescription, IronfishError> {
        let description = Self {
            version,
            min_signers,
            signers: signers.into_iter().collect(),
            signatures: vec![],
            address,
            transfers: transfers.into_iter().collect(),
        };

        description.valid()?;

        Ok(description)
    }
    pub fn read<R: io::Read>(mut reader: R) -> Result<Self, IronfishError> {
        let mut version_buf = [0; 1];
        reader.read_exact(&mut version_buf)?;
        let version = version_buf[0];

        let mut min_signers_buf = [0; 2];
        reader.read_exact(&mut min_signers_buf)?;
        let min_signers = u16::from_le_bytes(min_signers_buf);

        let mut signers_len_buf = [0; 2];
        reader.read_exact(&mut signers_len_buf)?;
        let signers_len = u16::from_le_bytes(signers_len_buf) as usize;

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
        let signatures_len = u16::from_le_bytes(signatures_len_buf) as usize;

        let mut signatures = Vec::with_capacity(signatures_len);
        for _ in 0..signatures_len {
            let mut signature_buf = [0; 64];
            reader.read_exact(&mut signature_buf)?;
            let signature = Signature::from_bytes(&signature_buf);
            signatures.push(signature);
        }

        let mut transfers_len_buf = [0; 2];
        reader.read_exact(&mut transfers_len_buf)?;
        let transfers_len = u16::from_le_bytes(transfers_len_buf) as usize;

        let mut transfers = Vec::with_capacity(transfers_len);
        for _ in 0..transfers_len {
            let transfer = Transfer::read(&mut reader)?;
            transfers.push(transfer);
        }
        let address = PublicAddress::read(&mut reader)?;

        let description = Self {
            version,
            min_signers,
            signers,
            signatures,
            address,
            transfers,
        };
        description.valid()?;
        Ok(description)
    }

    pub fn write<W: io::Write>(&self, mut writer: W) -> Result<(), IronfishError> {
        // TODO: think about ideal ordering here
        writer.write_all(&self.version.to_le_bytes())?;

        writer.write_all(&self.min_signers.to_le_bytes())?;

        let signers_len: u16 = self.signers.len().try_into()?;
        writer.write_all(&signers_len.to_le_bytes())?;

        for signer in &self.signers {
            writer.write_all(signer.as_bytes())?;
        }

        let signatures_len: u16 = self.signatures.len().try_into()?;
        writer.write_all(&signatures_len.to_le_bytes())?;

        for signature in &self.signatures {
            writer.write_all(&signature.to_bytes())?;
        }

        let transfers_len: u16 = self.transfers.len().try_into()?;
        writer.write_all(&transfers_len.to_le_bytes())?;

        for transfer in &self.transfers {
            transfer.write(&mut writer)?;
        }

        self.address.write(&mut writer)?;

        Ok(())
    }

    fn valid(&self) -> Result<(), IronfishError> {
        if self.min_signers < 1 {
            return Err(IronfishError::new(IronfishErrorKind::InvalidThreshold));
        }

        if self.signers.len() < self.min_signers as usize {
            return Err(IronfishError::new(IronfishErrorKind::InvalidThreshold));
        }

        let unique_signers: HashSet<_> = self.signers.iter().collect();
        if unique_signers.len() != self.signers.len() {
            return Err(IronfishError::new(IronfishErrorKind::DuplicateSigner));
        }

        Ok(())
    }

    fn verify(&self, signatures: &Vec<Signature>) -> Result<(), IronfishError> {
        self.valid()?;

        let mut signers = HashMap::new();
        let hash = self.hash()?;
        for signature in signatures {
            let signer = self
                .signers
                .iter()
                .filter(|signer| signer.verify(&hash, &signature).is_ok())
                .next();
            match signer {
                None => return Err(IronfishError::new(IronfishErrorKind::InvalidSignature)),
                Some(signer) => signers.entry(signer.clone()).and_modify(|count| *count += 1).or_insert(1),
            };
        }
        if signers.len() < self.min_signers.into() { return Err(IronfishError::new(IronfishErrorKind::SignatureThresholdNotMet)) }
        if signers.values().any(|count| *count > 1) { return Err(IronfishError::new(IronfishErrorKind::DuplicateSigner)) }
        Ok(())
    }

    pub fn hash(&self) -> Result<[u8; 32], IronfishError> {
        // TODO(jwp): verify which hashers supported by axelar
        let mut hasher = blake3::Hasher::new();
        hasher.update(&self.version.to_le_bytes());
        hasher.update(&self.min_signers.to_le_bytes());
        let signer_len = self.signers.len() as u16;
        hasher.update(&signer_len.to_le_bytes());
        for signer in &self.signers {
            hasher.update(signer.as_bytes());
        }
        let transfer_len = self.transfers.len() as u16;
        hasher.update(&transfer_len.to_le_bytes());
        for transfer in &self.transfers {
            hasher.update(&transfer.to_bytes()?);
        }
        hasher.update(&self.address.public_address());
        Ok(hasher.finalize().into())
    }

    pub fn sign(&mut self, signatures: impl IntoIterator<Item = Signature>) -> Result<(), IronfishError> {
        let signatures = signatures.into_iter().collect::<Vec<_>>();
        self.verify(&signatures)?;
        self.signatures.extend(signatures);
        Ok(())
    }

    pub fn version(&self) -> u8 {
        self.version
    }

    pub fn min_signers(&self) -> u16 {
        self.min_signers
    }

    pub fn signers(&self) -> &[VerifyingKey] {
        &self.signers
    }

    pub fn signatures(&self) -> &[Signature] {
        &self.signatures
    }

    pub fn transfers(&self) -> &[Transfer] {
        &self.transfers
    }

    pub fn address(&self) -> &PublicAddress {
        &self.address
    }
}

#[cfg(test)]
mod tests {
    use crate::{assets::asset_identifier, public_account::transfer::PublicMemo, SaplingKey};

    use super::*;
    use ed25519_dalek::{ed25519::signature::Signer, SigningKey};

    #[test]
    fn test_public_account_create_description() {
        let mut csprng = rand::thread_rng();
        let key = SaplingKey::generate_key();
        let public_address = key.public_address();
        let signing_key = SigningKey::generate(&mut csprng);
        let verifying_key = signing_key.verifying_key();
        let transfer = Transfer {
            asset_id: asset_identifier::NATIVE_ASSET,
            amount: 100,
            to: public_address,
            memo: PublicMemo([0; 256]),
        };
        let mut original = PublicAccountDescription::new(
            1,
            1,
            vec![verifying_key],
            vec![transfer],
            public_address,
        )
        .expect("Should successfully create description");

        let hash = original.hash().expect("Should successfully hash");
        let signature = signing_key.sign(&hash);

        original
            .sign(vec![signature])
            .expect("Should be valid/verified creation");
        
        assert_eq!(original.signatures.len(), 1);

        let mut buffer = Vec::new();
        original.write(&mut buffer).unwrap();

        let read = PublicAccountDescription::read(&buffer[..]).unwrap();

        assert_eq!(original.min_signers, read.min_signers);
        assert_eq!(original.signers, read.signers);
        assert_eq!(original.signatures, read.signatures);
    }
}
