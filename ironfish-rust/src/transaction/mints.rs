/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::{
    assets::asset::Asset,
    errors::{IronfishError, IronfishErrorKind},
    serializing::read_scalar,
    transaction::TransactionVersion,
    PublicAddress, SaplingKey,
};
use blstrs::{Bls12, Scalar};
use byteorder::{LittleEndian, ReadBytesExt, WriteBytesExt};
use ff::Field;
use group::{Curve, GroupEncoding};
use ironfish_bellperson::groth16;
use ironfish_jubjub::ExtendedPoint;
use ironfish_zkp::{
    constants::SPENDING_KEY_GENERATOR,
    redjubjub::{self, Signature},
};
use rand::thread_rng;
use std::io;

#[cfg(feature = "transaction-proofs")]
use crate::{sapling_bls12::SAPLING, transaction::verify::verify_mint_proof};
#[cfg(feature = "transaction-proofs")]
use ironfish_zkp::{proofs::MintAsset, ProofGenerationKey};

/// Parameters used to build a circuit that verifies an asset can be minted with
/// a given key
#[derive(Clone, Debug)]
#[cfg(feature = "transaction-proofs")]
pub struct MintBuilder {
    /// Asset to be minted
    pub asset: Asset,

    /// Amount of asset to mint. May be zero
    pub value: u64,

    /// Address of the account that will be authorized to perform future
    /// mints/burns for this asset after this transaction is executed
    pub transfer_ownership_to: Option<PublicAddress>,
}

#[cfg(feature = "transaction-proofs")]
impl MintBuilder {
    pub fn new(asset: Asset, value: u64) -> Self {
        Self {
            asset,
            value,
            transfer_ownership_to: None,
        }
    }

    pub fn transfer_ownership_to(&mut self, owner: PublicAddress) -> &mut Self {
        self.transfer_ownership_to = Some(owner);
        self
    }

    pub fn build_circuit(
        &self,
        proof_generation_key: &ProofGenerationKey,
        public_key_randomness: &ironfish_jubjub::Fr,
    ) -> MintAsset {
        MintAsset {
            proof_generation_key: Some(proof_generation_key.clone()),
            public_key_randomness: Some(*public_key_randomness),
        }
    }

    pub fn build(
        &self,
        proof_generation_key: &ProofGenerationKey,
        public_address: &PublicAddress,
        public_key_randomness: &ironfish_jubjub::Fr,
        randomized_public_key: &redjubjub::PublicKey,
    ) -> Result<UnsignedMintDescription, IronfishError> {
        let circuit = self.build_circuit(proof_generation_key, public_key_randomness);

        let proof = groth16::create_random_proof(circuit, &SAPLING.mint_params, &mut thread_rng())?;

        let blank_signature = {
            let buf = [0u8; 64];
            Signature::read(&mut buf.as_ref())?
        };

        let mint_description = MintDescription {
            proof,
            asset: self.asset,
            value: self.value,
            owner: *public_address,
            transfer_ownership_to: self.transfer_ownership_to,
            authorizing_signature: blank_signature,
        };
        mint_description.partial_verify()?;

        verify_mint_proof(
            &mint_description.proof,
            &mint_description.public_inputs(randomized_public_key),
        )?;

        Ok(UnsignedMintDescription {
            public_key_randomness: *public_key_randomness,
            description: mint_description,
        })
    }
}

/// The publicly visible values of a mint description in a transaction.
/// These fields get serialized when computing the transaction hash and are used
/// to prove that the creator has knowledge of these values.
#[derive(Clone, Debug)]
pub struct UnsignedMintDescription {
    /// Used to add randomness to signature generation. Referred to as `ar` in
    /// the literature.
    public_key_randomness: ironfish_jubjub::Fr,

    /// Proof and public parameters for a user action to issue supply for an
    /// asset.
    pub(crate) description: MintDescription,
}

impl UnsignedMintDescription {
    pub fn sign(
        mut self,
        spender_key: &SaplingKey,
        signature_hash: &[u8; 32],
    ) -> Result<MintDescription, IronfishError> {
        let private_key = redjubjub::PrivateKey(spender_key.spend_authorizing_key);
        let randomized_private_key = private_key.randomize(self.public_key_randomness);
        let randomized_public_key =
            redjubjub::PublicKey::from_private(&randomized_private_key, *SPENDING_KEY_GENERATOR);

        let transaction_randomized_public_key =
            redjubjub::PublicKey(spender_key.view_key.authorizing_key.into())
                .randomize(self.public_key_randomness, *SPENDING_KEY_GENERATOR);

        if randomized_public_key.0 != transaction_randomized_public_key.0 {
            return Err(IronfishError::new(IronfishErrorKind::InvalidSigningKey));
        }

        // NOTE: The initial versions of the RedDSA specification and the redjubjub crate (that
        // we're using here) require the public key bytes to be prefixed to the message. The latest
        // version of the spec and the crate add the public key bytes automatically. Therefore, if
        // in the future we upgrade to a newer version of redjubjub, `data_to_be_signed` will have
        // to equal `signature_hash`
        let mut data_to_be_signed = [0; 64];
        data_to_be_signed[..32].copy_from_slice(&randomized_public_key.0.to_bytes());
        data_to_be_signed[32..].copy_from_slice(&signature_hash[..]);

        self.description.authorizing_signature = randomized_private_key.sign(
            &data_to_be_signed,
            &mut thread_rng(),
            *SPENDING_KEY_GENERATOR,
        );

        Ok(self.description)
    }

    pub fn add_signature(mut self, signature: Signature) -> MintDescription {
        self.description.authorizing_signature = signature;
        self.description
    }

    pub fn read<R: io::Read>(
        mut reader: R,
        version: TransactionVersion,
    ) -> Result<Self, IronfishError> {
        let public_key_randomness = read_scalar(&mut reader)?;
        let description = MintDescription::read(&mut reader, version)?;

        Ok(UnsignedMintDescription {
            public_key_randomness,
            description,
        })
    }

    pub fn write<W: io::Write>(
        &self,
        mut writer: W,
        version: TransactionVersion,
    ) -> Result<(), IronfishError> {
        writer.write_all(&self.public_key_randomness.to_bytes())?;
        self.description.write(&mut writer, version)?;

        Ok(())
    }

    pub fn description(&self) -> &MintDescription {
        &self.description
    }
}

/// This description represents an action to increase the supply of an existing
/// asset on Iron Fish
#[derive(Clone, Debug)]
pub struct MintDescription {
    /// Proof that the mint was valid for the provided creator and asset
    pub proof: groth16::Proof<Bls12>,

    /// Asset which is being minted
    pub asset: Asset,

    /// Amount of asset to mint. May be zero
    pub value: u64,

    /// Address of the account that is the current owner, used as part of the
    /// proof. For V1 transactions, this is always the asset creator
    pub owner: PublicAddress,

    /// Address of the account that will be authorized to perform future
    /// mints/burns for this asset after this transaction is executed
    pub transfer_ownership_to: Option<PublicAddress>,

    /// Signature of the creator authorizing the mint action. This value is
    /// calculated after the transaction is signed since the value is dependent
    /// on the binding signature key
    pub authorizing_signature: Signature,
}

impl MintDescription {
    /// Verify that the signature on this proof is signing the provided input
    /// with the randomized_public_key on this proof.
    pub fn verify_signature(
        &self,
        signature_hash_value: &[u8; 32],
        randomized_public_key: &redjubjub::PublicKey,
    ) -> Result<(), IronfishError> {
        if randomized_public_key.0.is_small_order().into() {
            return Err(IronfishError::new(IronfishErrorKind::IsSmallOrder));
        }

        // NOTE: The initial versions of the RedDSA specification and the redjubjub crate (that
        // we're using here) require the public key bytes to be prefixed to the message. The latest
        // version of the spec and the crate add the public key bytes automatically. Therefore, if
        // in the future we upgrade to a newer version of redjubjub, `data_to_be_signed` will have
        // to equal `signature_hash_value`
        let mut data_to_be_signed = [0; 64];
        data_to_be_signed[..32].copy_from_slice(&randomized_public_key.0.to_bytes());
        data_to_be_signed[32..].copy_from_slice(&signature_hash_value[..]);

        if !randomized_public_key.verify(
            &data_to_be_signed,
            &self.authorizing_signature,
            *SPENDING_KEY_GENERATOR,
        ) {
            return Err(IronfishError::new(IronfishErrorKind::InvalidMintSignature));
        }

        Ok(())
    }

    pub fn public_inputs(&self, randomized_public_key: &redjubjub::PublicKey) -> [Scalar; 4] {
        let mut public_inputs = [Scalar::zero(); 4];

        let randomized_public_key_point = randomized_public_key.0.to_affine();
        public_inputs[0] = randomized_public_key_point.get_u();
        public_inputs[1] = randomized_public_key_point.get_v();

        let public_address_point = ExtendedPoint::from(self.owner.0).to_affine();
        public_inputs[2] = public_address_point.get_u();
        public_inputs[3] = public_address_point.get_v();

        public_inputs
    }

    /// A function to encapsulate any verification besides the proof itself.
    /// This allows us to abstract away the details and make it easier to work
    /// with. Note that this does not verify the proof, that happens in the
    /// [`MintBuilder`] build function as the prover, and in
    /// [`super::batch_verify_transactions`] as the verifier.
    pub fn partial_verify(&self) -> Result<(), IronfishError> {
        self.verify_valid_asset()?;

        Ok(())
    }

    fn verify_valid_asset(&self) -> Result<(), IronfishError> {
        let asset = Asset::new_with_nonce(
            self.asset.creator,
            self.asset.name,
            self.asset.metadata,
            self.asset.nonce,
        )?;
        if asset.id != self.asset.id {
            return Err(IronfishError::new(
                IronfishErrorKind::InvalidAssetIdentifier,
            ));
        }

        Ok(())
    }

    /// Write the signature of this proof to the provided writer.
    ///
    /// The signature is used by the transaction to calculate the signature
    /// hash. Having this data essentially binds the note to the transaction,
    /// proving that it is actually part of that transaction.
    pub(crate) fn serialize_signature_fields<W: io::Write>(
        &self,
        mut writer: W,
        version: TransactionVersion,
    ) -> Result<(), IronfishError> {
        self.proof.write(&mut writer)?;
        self.asset.write(&mut writer)?;
        writer.write_u64::<LittleEndian>(self.value)?;
        if version.has_mint_transfer_ownership_to() {
            self.owner.write(&mut writer)?;

            if let Some(ref transfer_ownership_to) = self.transfer_ownership_to {
                writer.write_u8(1)?;
                transfer_ownership_to.write(&mut writer)?;
            } else {
                writer.write_u8(0)?;
            }
        } else if self.transfer_ownership_to.is_some() {
            return Err(IronfishError::new(
                IronfishErrorKind::InvalidTransactionVersion,
            ));
        }

        Ok(())
    }

    pub fn read<R: io::Read>(
        mut reader: R,
        version: TransactionVersion,
    ) -> Result<Self, IronfishError> {
        let proof = groth16::Proof::read(&mut reader)?;
        let asset = Asset::read(&mut reader)?;
        let value = reader.read_u64::<LittleEndian>()?;

        let owner: PublicAddress;
        let transfer_ownership_to;
        if version.has_mint_transfer_ownership_to() {
            owner = PublicAddress::read(&mut reader)?;
            transfer_ownership_to = if reader.read_u8()? != 0 {
                Some(PublicAddress::read(&mut reader)?)
            } else {
                None
            }
        } else {
            owner = asset.creator;
            transfer_ownership_to = None;
        }

        let authorizing_signature = Signature::read(&mut reader)?;

        Ok(MintDescription {
            proof,
            asset,
            value,
            owner,
            transfer_ownership_to,
            authorizing_signature,
        })
    }

    /// Stow the bytes of this [`MintDescription`] in the given writer.
    pub fn write<W: io::Write>(
        &self,
        mut writer: W,
        version: TransactionVersion,
    ) -> Result<(), IronfishError> {
        self.serialize_signature_fields(&mut writer, version)?;
        self.authorizing_signature.write(&mut writer)?;

        Ok(())
    }
}

#[cfg(test)]
#[cfg(feature = "transaction-proofs")]
mod test {
    use crate::{
        assets::asset::Asset,
        errors::IronfishErrorKind,
        transaction::{
            mints::{MintBuilder, MintDescription},
            verify::verify_mint_proof,
            TransactionVersion,
        },
        PublicAddress, SaplingKey,
    };
    use ff::Field;
    use ironfish_zkp::{constants::SPENDING_KEY_GENERATOR, redjubjub};
    use rand::{random, thread_rng};

    /// Test that we can create a builder with a valid asset and proof
    /// generation key
    #[test]
    fn test_mint_builder() {
        let key = SaplingKey::generate_key();
        let creator = key.public_address();
        let name = "name";
        let metadata = "{ 'token_identifier': '0x123' }";

        let asset = Asset::new(creator, name, metadata).unwrap();

        let value = 5;

        let public_key_randomness = ironfish_jubjub::Fr::random(thread_rng());
        let randomized_public_key = redjubjub::PublicKey(key.view_key.authorizing_key.into())
            .randomize(public_key_randomness, *SPENDING_KEY_GENERATOR);

        let mint = MintBuilder::new(asset, value);
        let unsigned_mint = mint
            .build(
                &key.sapling_proof_generation_key(),
                &key.public_address(),
                &public_key_randomness,
                &randomized_public_key,
            )
            .expect("should build valid mint description");

        // Signature comes from the transaction, normally
        let sig_hash = [0u8; 32];

        let description = unsigned_mint
            .sign(&key, &sig_hash)
            .expect("should be able to sign proof");

        verify_mint_proof(
            &description.proof,
            &description.public_inputs(&randomized_public_key),
        )
        .expect("proof should check out");

        description
            .verify_signature(&sig_hash, &randomized_public_key)
            .expect("should be able to verify signature");

        let other_sig_hash = [1u8; 32];
        assert!(description
            .verify_signature(&other_sig_hash, &randomized_public_key)
            .is_err());

        let other_randomized_public_key = redjubjub::PublicKey(key.view_key.authorizing_key.into())
            .randomize(
                ironfish_jubjub::Fr::random(thread_rng()),
                *SPENDING_KEY_GENERATOR,
            );

        assert!(verify_mint_proof(
            &description.proof,
            &description.public_inputs(&other_randomized_public_key),
        )
        .is_err());

        assert!(description
            .verify_signature(&sig_hash, &other_randomized_public_key)
            .is_err());
    }

    #[test]
    fn test_mint_description_v1_invalid_owner() {
        let key = SaplingKey::generate_key();
        let creator = key.public_address();
        let owner_key = SaplingKey::generate_key();
        let name = "name";
        let metadata = "{ 'token_identifier': '0x123' }";

        let asset = Asset::new(creator, name, metadata).unwrap();

        let public_key_randomness = ironfish_jubjub::Fr::random(thread_rng());
        let randomized_public_key = redjubjub::PublicKey(key.view_key.authorizing_key.into())
            .randomize(public_key_randomness, *SPENDING_KEY_GENERATOR);

        let value = 5;
        let mint = MintBuilder::new(asset, value);

        assert!(matches!(
            mint.build(&owner_key.sapling_proof_generation_key(), &owner_key.public_address(), &public_key_randomness, &randomized_public_key),
            Err(e) if matches!(e.kind, IronfishErrorKind::InvalidMintProof)
        ))
    }

    #[test]
    fn test_mint_description_serialization_v1() {
        let key = SaplingKey::generate_key();
        let creator = key.public_address();
        let name = "name";
        let metadata = "{ 'token_identifier': '0x123' }";

        let asset = Asset::new(creator, name, metadata).unwrap();

        let value = 5;
        let mint = MintBuilder::new(asset, value);

        let description = test_mint_description_serialization(TransactionVersion::V1, &key, &mint);

        assert_eq!(description.owner, creator);
    }

    #[test]
    fn test_mint_description_serialization_v2_without_transfer() {
        let key = SaplingKey::generate_key();
        let creator = key.public_address();
        let name = "name";
        let metadata = "{ 'token_identifier': '0x123' }";

        let asset = Asset::new(creator, name, metadata).unwrap();

        let value = 5;
        let mint = MintBuilder::new(asset, value);
        assert_eq!(mint.transfer_ownership_to, None);

        test_mint_description_serialization(TransactionVersion::V2, &key, &mint);
    }

    #[test]
    fn test_mint_description_serialization_v2_with_transfer() {
        let key = SaplingKey::generate_key();
        let creator = key.public_address();
        let name = "name";
        let metadata = "{ 'token_identifier': '0x123' }";

        let asset = Asset::new(creator, name, metadata).unwrap();

        let value = 5;
        let mut mint = MintBuilder::new(asset, value);
        mint.transfer_ownership_to(
            PublicAddress::from_hex(
                "8a4685307f159e95418a0dd3d38a3245f488c1baf64bc914f53486efd370c563",
            )
            .unwrap(),
        );

        test_mint_description_serialization(TransactionVersion::V2, &key, &mint);
    }

    #[test]
    fn test_mint_description_serialization_v2_with_creator_owner() {
        let key = SaplingKey::generate_key();
        let creator = key.public_address();
        let name = "name";
        let metadata = "{ 'token_identifier': '0x123' }";

        let asset = Asset::new(creator, name, metadata).unwrap();

        let value = 5;
        let mint = MintBuilder::new(asset, value);

        let description = test_mint_description_serialization(TransactionVersion::V2, &key, &mint);

        assert_eq!(description.owner, creator);
    }

    #[test]
    fn test_mint_description_serialization_v2_with_different_owner() {
        let key = SaplingKey::generate_key();
        let creator = key.public_address();
        let owner_key = SaplingKey::generate_key();
        let owner = owner_key.public_address();
        let name = "name";
        let metadata = "{ 'token_identifier': '0x123' }";

        let asset = Asset::new(creator, name, metadata).unwrap();

        let value = 5;
        let mint = MintBuilder::new(asset, value);

        let description =
            test_mint_description_serialization(TransactionVersion::V2, &owner_key, &mint);

        assert_eq!(description.owner, owner);
    }

    fn test_mint_description_serialization(
        version: TransactionVersion,
        key: &SaplingKey,
        mint: &MintBuilder,
    ) -> MintDescription {
        let public_key_randomness = ironfish_jubjub::Fr::random(thread_rng());
        let randomized_public_key = redjubjub::PublicKey(key.view_key.authorizing_key.into())
            .randomize(public_key_randomness, *SPENDING_KEY_GENERATOR);

        let unsigned_mint = mint
            .build(
                &key.sapling_proof_generation_key(),
                &key.public_address(),
                &public_key_randomness,
                &randomized_public_key,
            )
            .expect("should build valid mint description");

        // Signature comes from the transaction, normally
        let sig_hash = [0u8; 32];

        let description = unsigned_mint
            .sign(key, &sig_hash)
            .expect("should be able to sign proof");

        verify_mint_proof(
            &description.proof,
            &description.public_inputs(&randomized_public_key),
        )
        .expect("proof should check out");

        let mut serialized_description = vec![];
        description
            .write(&mut serialized_description, version)
            .expect("should be able to serialize description");

        let deserialized_description = MintDescription::read(&serialized_description[..], version)
            .expect("should be able to deserialize valid description");

        // Proof
        assert_eq!(description.proof.a, deserialized_description.proof.a);
        assert_eq!(description.proof.b, deserialized_description.proof.b);
        assert_eq!(description.proof.c, deserialized_description.proof.c);

        // Value
        assert_eq!(description.value, deserialized_description.value);
        assert_eq!(description.value, mint.value);

        // Owner
        assert_eq!(description.owner, deserialized_description.owner);
        assert_eq!(description.owner, key.public_address());

        // Ownership transfer
        assert_eq!(
            description.transfer_ownership_to,
            deserialized_description.transfer_ownership_to
        );
        assert_eq!(
            description.transfer_ownership_to,
            mint.transfer_ownership_to
        );

        // Signature
        // Instantiated with different data just to ensure this test actually does what we expect
        let mut description_sig = [9u8; 64];
        let mut deserialized_description_sig = [5u8; 64];

        description
            .authorizing_signature
            .write(&mut description_sig[..])
            .unwrap();

        deserialized_description
            .authorizing_signature
            .write(&mut deserialized_description_sig[..])
            .unwrap();

        assert_eq!(description_sig, deserialized_description_sig);

        // Re-serialize for one final sanity check
        let mut reserialized_description = vec![];
        deserialized_description
            .write(&mut reserialized_description, version)
            .expect("should be able to serialize proof again");
        assert_eq!(serialized_description, reserialized_description);

        deserialized_description
    }

    #[test]
    fn test_mint_invalid_id() {
        let key = SaplingKey::generate_key();
        let creator = key.public_address();
        let name = "name";
        let metadata = "{ 'token_identifier': '0x123' }";

        let asset = Asset::new(creator, name, metadata).unwrap();
        let fake_asset = Asset::new(creator, name, "").unwrap();

        let value = 5;

        let public_key_randomness = ironfish_jubjub::Fr::random(thread_rng());
        let randomized_public_key = redjubjub::PublicKey(key.view_key.authorizing_key.into())
            .randomize(public_key_randomness, *SPENDING_KEY_GENERATOR);

        let mint = MintBuilder::new(
            Asset {
                id: fake_asset.id,
                metadata: asset.metadata,
                name: asset.name,
                nonce: asset.nonce,
                creator: asset.creator,
            },
            value,
        );

        let unsigned_mint = mint.build(
            &key.sapling_proof_generation_key(),
            &key.public_address(),
            &public_key_randomness,
            &randomized_public_key,
        );
        assert!(unsigned_mint.is_err());
    }

    #[test]
    fn test_add_signature() {
        let key = SaplingKey::generate_key();
        let public_address = key.public_address();

        let asset = Asset::new(public_address, "name", "").expect("should be able to create asset");
        let public_key_randomness = ironfish_jubjub::Fr::random(thread_rng());
        let randomized_public_key = redjubjub::PublicKey(key.view_key.authorizing_key.into())
            .randomize(public_key_randomness, *SPENDING_KEY_GENERATOR);
        let value = random();
        let builder = MintBuilder::new(asset, value);
        // create a random private key and sign random message as placeholder
        let private_key = redjubjub::PrivateKey(ironfish_jubjub::Fr::random(thread_rng()));
        let public_key = redjubjub::PublicKey::from_private(&private_key, *SPENDING_KEY_GENERATOR);
        let msg = [0u8; 32];
        let signature = private_key.sign(&msg, &mut thread_rng(), *SPENDING_KEY_GENERATOR);
        let unsigned_spend_description = builder
            .build(
                &key.sapling_proof_generation_key(),
                &key.public_address(),
                &public_key_randomness,
                &randomized_public_key,
            )
            .expect("should be able to build proof");
        unsigned_spend_description.add_signature(signature);
        assert!(public_key.verify(&msg, &signature, *SPENDING_KEY_GENERATOR))
    }
}
