use bellman::{
    gadgets::{blake2s, boolean, multipack},
    Circuit,
};
use ff::PrimeField;
use zcash_primitives::{constants::CRH_IVK_PERSONALIZATION, sapling::ProofGenerationKey};
use zcash_proofs::{
    circuit::{ecc, pedersen_hash},
    constants::{PROOF_GENERATION_KEY_GENERATOR, SPENDING_KEY_GENERATOR},
};

use crate::{
    circuits::util::asset_info_preimage,
    constants::{proof::PUBLIC_KEY_GENERATOR, ASSET_ID_PERSONALIZATION},
};

pub struct MintAsset {
    /// Name of the asset
    pub name: [u8; 32],

    /// Identifier field for bridged asset address, or if a native custom asset, random bytes.
    /// Metadata for the asset (ex. chain, network, token identifier)
    pub metadata: [u8; 77],

    /// Key required to construct proofs for a particular spending key
    pub proof_generation_key: Option<ProofGenerationKey>,

    /// Used to add randomness to signature generation without leaking the
    /// key. Referred to as `ar` in the literature.
    pub public_key_randomness: Option<jubjub::Fr>,
}

impl Circuit<bls12_381::Scalar> for MintAsset {
    fn synthesize<CS: bellman::ConstraintSystem<bls12_381::Scalar>>(
        self,
        cs: &mut CS,
    ) -> Result<(), bellman::SynthesisError> {
        // Prover witnesses ak (ensures that it's on the curve)
        let ak = ecc::EdwardsPoint::witness(
            cs.namespace(|| "ak"),
            self.proof_generation_key.as_ref().map(|k| k.ak.into()),
        )?;

        // There are no sensible attacks on small order points
        // of ak (that we're aware of!) but it's a cheap check,
        // so we do it.
        ak.assert_not_small_order(cs.namespace(|| "ak not small order"))?;

        // Rerandomize ak and expose it as an input to the circuit
        {
            let ar = boolean::field_into_boolean_vec_le(
                cs.namespace(|| "ar"),
                self.public_key_randomness,
            )?;

            // Compute the randomness in the exponent
            let ar = ecc::fixed_base_multiplication(
                cs.namespace(|| "computation of randomization for the signing key"),
                &SPENDING_KEY_GENERATOR,
                &ar,
            )?;

            let rk = ak.add(cs.namespace(|| "computation of rk"), &ar)?;

            rk.inputize(cs.namespace(|| "rk"))?;
        }

        // Compute nk = [nsk] ProofGenerationKey
        let nk;
        {
            // Witness nsk as bits
            let nsk = boolean::field_into_boolean_vec_le(
                cs.namespace(|| "nsk"),
                self.proof_generation_key.as_ref().map(|k| k.nsk),
            )?;

            // NB: We don't ensure that the bit representation of nsk
            // is "in the field" (jubjub::Fr) because it's not used
            // except to demonstrate the prover knows it. If they know
            // a congruency then that's equivalent.

            // Compute nk = [nsk] ProvingPublicKey
            nk = ecc::fixed_base_multiplication(
                cs.namespace(|| "computation of nk"),
                &PROOF_GENERATION_KEY_GENERATOR,
                &nsk,
            )?;
        }

        // This is the "viewing key" preimage for CRH^ivk
        let mut ivk_preimage = vec![];

        // Place ak in the preimage for CRH^ivk
        ivk_preimage.extend(ak.repr(cs.namespace(|| "representation of ak"))?);

        // Extend ivk preimage with the representation of nk.
        {
            let repr_nk = nk.repr(cs.namespace(|| "representation of nk"))?;

            ivk_preimage.extend(repr_nk.iter().cloned());
        }

        assert_eq!(ivk_preimage.len(), 512);

        // Compute the incoming viewing key ivk
        let mut ivk = blake2s::blake2s(
            cs.namespace(|| "computation of ivk"),
            &ivk_preimage,
            CRH_IVK_PERSONALIZATION,
        )?;

        // drop_5 to ensure it's in the field
        ivk.truncate(jubjub::Fr::CAPACITY as usize);

        // Compute owner public address
        let owner_public_address = ecc::fixed_base_multiplication(
            cs.namespace(|| "compute pk_d"),
            &PUBLIC_KEY_GENERATOR,
            &ivk,
        )?;

        // Create the Asset Info pre-image
        let asset_info_preimage = asset_info_preimage(
            &mut cs.namespace(|| "asset info preimage"),
            &self.name,
            &self.metadata,
            &owner_public_address,
        )?;

        // Computed identifier bits from the given asset info
        let asset_info_hashed_point = pedersen_hash::pedersen_hash(
            cs.namespace(|| "asset info hash"),
            ASSET_ID_PERSONALIZATION,
            &asset_info_preimage,
        )?;

        let asset_info_hashed_bits =
            asset_info_hashed_point.repr(cs.namespace(|| "asset info hashed bytes"))?;

        // Ensure the pre-image of the generator is 32 bytes
        assert_eq!(asset_info_hashed_bits.len(), 256);

        multipack::pack_into_inputs(cs.namespace(|| "pack asset info"), &asset_info_hashed_bits)?;

        Ok(())
    }
}

#[cfg(test)]
mod test {
    use bellman::{
        gadgets::{multipack, test::TestConstraintSystem},
        Circuit,
    };
    use ff::Field;
    use group::{Curve, Group, GroupEncoding};
    use jubjub::ExtendedPoint;
    use rand::{rngs::StdRng, SeedableRng};
    use zcash_primitives::sapling::{pedersen_hash, ProofGenerationKey};

    use crate::constants::{ASSET_ID_PERSONALIZATION, PUBLIC_KEY_GENERATOR};

    use super::MintAsset;

    #[test]
    fn test_mint_asset_circuit() {
        // Seed a fixed rng for determinism in the test
        let mut rng = StdRng::seed_from_u64(1);

        let mut cs = TestConstraintSystem::new();

        let proof_generation_key = ProofGenerationKey {
            ak: jubjub::SubgroupPoint::random(&mut rng),
            nsk: jubjub::Fr::random(&mut rng),
        };
        let incoming_view_key = proof_generation_key.to_viewing_key();
        let public_address = PUBLIC_KEY_GENERATOR * incoming_view_key.ivk().0;

        let name = [1u8; 32];
        let metadata = [2u8; 77];

        let mut asset_plaintext: Vec<u8> = vec![];
        asset_plaintext.extend(public_address.to_bytes());
        asset_plaintext.extend(name);
        asset_plaintext.extend(metadata);

        let asset_plaintext_bits = multipack::bytes_to_bits_le(&asset_plaintext);

        let asset_info_hashed_point =
            pedersen_hash::pedersen_hash(ASSET_ID_PERSONALIZATION, asset_plaintext_bits);

        let asset_info_hashed_bytes = asset_info_hashed_point.to_bytes();

        let asset_info_hashed_bits = multipack::bytes_to_bits_le(&asset_info_hashed_bytes);
        let asset_info_hashed_inputs = multipack::compute_multipacking(&asset_info_hashed_bits);

        let public_key_randomness = jubjub::Fr::random(&mut rng);
        let randomized_public_key =
            ExtendedPoint::from(incoming_view_key.rk(public_key_randomness)).to_affine();

        let public_inputs = vec![
            randomized_public_key.get_u(),
            randomized_public_key.get_v(),
            asset_info_hashed_inputs[0],
            asset_info_hashed_inputs[1],
        ];

        // Mint proof
        let circuit = MintAsset {
            name,
            metadata,
            proof_generation_key: Some(proof_generation_key),
            public_key_randomness: Some(public_key_randomness),
        };
        circuit.synthesize(&mut cs).unwrap();

        assert!(cs.is_satisfied());
        assert!(cs.verify(&public_inputs));
        assert_eq!(cs.num_constraints(), 29677);

        // Test bad inputs
        let bad_asset_info_hashed = [1u8; 32];
        let bad_asset_info_hashed_bits = multipack::bytes_to_bits_le(&bad_asset_info_hashed);
        let bad_asset_info_hashed_inputs =
            multipack::compute_multipacking(&bad_asset_info_hashed_bits);

        // Bad asset info hash
        let mut bad_inputs = public_inputs.clone();
        bad_inputs[2] = bad_asset_info_hashed_inputs[0];

        assert!(!cs.verify(&bad_inputs));

        // Bad randomized public key
        let bad_randomized_public_key_point = ExtendedPoint::random(&mut rng).to_affine();
        let mut bad_inputs = public_inputs.clone();
        bad_inputs[0] = bad_randomized_public_key_point.get_u();

        assert!(!cs.verify(&bad_inputs));

        // Sanity check
        assert!(cs.verify(&public_inputs));
    }
}
