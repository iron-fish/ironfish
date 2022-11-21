use bellman::{
    gadgets::{boolean, multipack},
    Circuit,
};
use zcash_proofs::circuit::{ecc, pedersen_hash};

use crate::{
    circuits::util::{asset_info_preimage, expose_randomized_public_key, expose_value_commitment},
    constants::{proof::ASSET_KEY_GENERATOR, ASSET_IDENTIFIER_PERSONALIZATION},
    ValueCommitment,
};

pub struct MintAsset {
    /// Name of the asset
    pub name: [u8; 32],

    /// Identifier field for bridged asset address, or if a native custom asset, random bytes.
    /// Metadata for the asset (ex. chain, network, token identifier)
    pub metadata: [u8; 76],

    /// The random byte used to ensure we get a valid asset identifier
    pub nonce: u8,

    /// Private keys associated with the public key used to create the
    /// identifier
    pub asset_authorization_key: Option<jubjub::Fr>,

    /// Randomized commitment to represent the value being minted in this proof
    /// needed to balance the transaction.
    pub value_commitment: Option<ValueCommitment>,

    /// Used to add randomness to signature generation without leaking the
    /// key. Referred to as `ar` in the literature.
    pub public_key_randomness: Option<jubjub::Fr>,
}

impl Circuit<bls12_381::Scalar> for MintAsset {
    fn synthesize<CS: bellman::ConstraintSystem<bls12_381::Scalar>>(
        self,
        cs: &mut CS,
    ) -> Result<(), bellman::SynthesisError> {
        let asset_authorization_key_bits = boolean::field_into_boolean_vec_le(
            cs.namespace(|| "booleanize asset authorization key"),
            self.asset_authorization_key,
        )?;

        let asset_public_key = ecc::fixed_base_multiplication(
            cs.namespace(|| "computation of asset public key"),
            &ASSET_KEY_GENERATOR,
            &asset_authorization_key_bits,
        )?;

        asset_public_key
            .assert_not_small_order(cs.namespace(|| "asset_public_key not small order"))?;

        // Create the Asset Info pre-image
        let identifier_preimage = asset_info_preimage(
            &mut cs.namespace(|| "asset info preimage"),
            &self.name,
            &self.metadata,
            &asset_public_key,
            &self.nonce,
        )?;

        // Computed identifier bits from the given asset info
        let asset_identifier_point = pedersen_hash::pedersen_hash(
            cs.namespace(|| "asset identifier hash"),
            ASSET_IDENTIFIER_PERSONALIZATION,
            &identifier_preimage,
        )?;

        let asset_identifier =
            asset_identifier_point.repr(cs.namespace(|| "asset identifier bytes"))?;

        // Ensure the pre-image of the generator is 32 bytes
        assert_eq!(asset_identifier.len(), 256);

        multipack::pack_into_inputs(cs.namespace(|| "pack identifier"), &asset_identifier)?;

        // Witness and expose the value commitment
        let asset_generator = ecc::EdwardsPoint::witness(
            cs.namespace(|| "asset_generator"),
            self.value_commitment
                .as_ref()
                .map(|vc| vc.asset_generator.into()),
        )?;

        expose_value_commitment(
            cs.namespace(|| "value commitment"),
            asset_generator,
            self.value_commitment,
        )?;

        // Witness and expose the randomized public key
        expose_randomized_public_key(
            cs.namespace(|| "randomized public key"),
            self.public_key_randomness,
            &asset_public_key,
        )?;

        Ok(())
    }
}

#[cfg(test)]
mod test {
    use std::slice;

    use bellman::{
        gadgets::{multipack, test::TestConstraintSystem},
        Circuit,
    };
    use ff::Field;
    use group::{Curve, Group, GroupEncoding};
    use jubjub::ExtendedPoint;
    use rand::{rngs::StdRng, SeedableRng};
    use zcash_primitives::{
        constants::VALUE_COMMITMENT_VALUE_GENERATOR,
        sapling::{pedersen_hash, redjubjub},
    };

    use crate::{
        constants::{ASSET_IDENTIFIER_PERSONALIZATION, ASSET_KEY_GENERATOR},
        ValueCommitment,
    };

    use super::MintAsset;

    #[test]
    fn test_mint_asset_circuit() {
        // Seed a fixed rng for determinism in the test
        let mut rng = StdRng::seed_from_u64(1);

        let mut cs = TestConstraintSystem::new();

        let asset_auth_key = jubjub::Fr::random(&mut rng);
        let asset_public_key = ASSET_KEY_GENERATOR * asset_auth_key;

        let name = [1u8; 32];
        let metadata = [2u8; 76];
        let nonce = 1u8;

        let mut asset_plaintext: Vec<u8> = vec![];
        asset_plaintext.extend(&asset_public_key.to_bytes());
        asset_plaintext.extend(name);
        asset_plaintext.extend(metadata);
        asset_plaintext.extend(slice::from_ref(&nonce));

        let asset_plaintext_bits = multipack::bytes_to_bits_le(&asset_plaintext);

        let identifier_point =
            pedersen_hash::pedersen_hash(ASSET_IDENTIFIER_PERSONALIZATION, asset_plaintext_bits);

        let identifier = identifier_point.to_bytes();

        let identifier_bits = multipack::bytes_to_bits_le(&identifier);
        let identifier_inputs = multipack::compute_multipacking(&identifier_bits);

        let value_commitment = ValueCommitment {
            value: 5,
            randomness: jubjub::Fr::random(&mut rng),
            asset_generator: VALUE_COMMITMENT_VALUE_GENERATOR,
        };

        let value_commitment_point = ExtendedPoint::from(value_commitment.commitment()).to_affine();

        let public_key_randomness = jubjub::Fr::random(&mut rng);
        let randomized_public_key = redjubjub::PublicKey(asset_public_key.into())
            .randomize(public_key_randomness, ASSET_KEY_GENERATOR);
        let randomized_public_key_point = randomized_public_key.0.to_affine();

        let public_inputs = vec![
            identifier_inputs[0],
            identifier_inputs[1],
            value_commitment_point.get_u(),
            value_commitment_point.get_v(),
            randomized_public_key_point.get_u(),
            randomized_public_key_point.get_v(),
        ];

        // Mint proof
        let circuit = MintAsset {
            name,
            metadata,
            nonce,
            asset_authorization_key: Some(asset_auth_key),
            value_commitment: Some(value_commitment),
            public_key_randomness: Some(public_key_randomness),
        };
        circuit.synthesize(&mut cs).unwrap();

        assert!(cs.is_satisfied());
        assert!(cs.verify(&public_inputs));
        assert_eq!(cs.num_constraints(), 8265);
    }

    #[test]
    fn test_mint_asset_circuit_bad_inputs() {
        // Seed a fixed rng for determinism in the test
        let mut rng = StdRng::seed_from_u64(1);

        let mut cs = TestConstraintSystem::new();

        let asset_auth_key = jubjub::Fr::random(&mut rng);
        let asset_public_key = ASSET_KEY_GENERATOR * asset_auth_key;

        let name = [1u8; 32];
        let metadata = [2u8; 76];
        let nonce = 1u8;

        let mut asset_plaintext: Vec<u8> = vec![];
        asset_plaintext.extend(&asset_public_key.to_bytes());
        asset_plaintext.extend(name);
        asset_plaintext.extend(metadata);
        asset_plaintext.extend(slice::from_ref(&nonce));

        let asset_plaintext_bits = multipack::bytes_to_bits_le(&asset_plaintext);

        let identifier_point =
            pedersen_hash::pedersen_hash(ASSET_IDENTIFIER_PERSONALIZATION, asset_plaintext_bits);

        let identifier = identifier_point.to_bytes();

        let identifier_bits = multipack::bytes_to_bits_le(&identifier);
        let identifier_inputs = multipack::compute_multipacking(&identifier_bits);

        let value_commitment = ValueCommitment {
            value: 5,
            randomness: jubjub::Fr::random(&mut rng),
            asset_generator: VALUE_COMMITMENT_VALUE_GENERATOR,
        };

        let value_commitment_point = ExtendedPoint::from(value_commitment.commitment()).to_affine();

        let public_key_randomness = jubjub::Fr::random(&mut rng);
        let randomized_public_key = redjubjub::PublicKey(asset_public_key.into())
            .randomize(public_key_randomness, ASSET_KEY_GENERATOR);
        let randomized_public_key_point = randomized_public_key.0.to_affine();

        let public_inputs = vec![
            identifier_inputs[0],
            identifier_inputs[1],
            value_commitment_point.get_u(),
            value_commitment_point.get_v(),
            randomized_public_key_point.get_u(),
            randomized_public_key_point.get_v(),
        ];

        // Mint proof
        let circuit = MintAsset {
            name,
            metadata,
            nonce,
            asset_authorization_key: Some(asset_auth_key),
            value_commitment: Some(value_commitment),
            public_key_randomness: Some(public_key_randomness),
        };
        circuit.synthesize(&mut cs).unwrap();

        let bad_identifier = [1u8; 32];
        let bad_identifier_bits = multipack::bytes_to_bits_le(&bad_identifier);
        let bad_identifier_inputs = multipack::compute_multipacking(&bad_identifier_bits);

        // Bad identifier
        let mut bad_inputs = public_inputs.clone();
        bad_inputs[0] = bad_identifier_inputs[0];

        assert!(!cs.verify(&bad_inputs));

        // Bad value commitment
        let bad_value_commitment_point = ExtendedPoint::random(&mut rng).to_affine();
        let mut bad_inputs = public_inputs.clone();
        bad_inputs[2] = bad_value_commitment_point.get_u();

        assert!(!cs.verify(&bad_inputs));

        // Bad randomized public key
        let bad_randomized_public_key_point = ExtendedPoint::random(&mut rng).to_affine();
        let mut bad_inputs = public_inputs.clone();
        bad_inputs[4] = bad_randomized_public_key_point.get_u();

        assert!(!cs.verify(&bad_inputs));

        // Sanity check
        assert!(cs.verify(&public_inputs));
    }
}
