use std::slice;

use bellman::{
    gadgets::{blake2s, boolean, multipack, num, Assignment},
    Circuit, ConstraintSystem,
};
use ff::PrimeField;
use zcash_primitives::{
    constants::{self, GH_FIRST_BLOCK},
    primitives::ProofGenerationKey,
};
use zcash_proofs::{circuit::{pedersen_hash}, constants::NOTE_COMMITMENT_RANDOMNESS_GENERATOR};
use zcash_proofs::{circuit::ecc, constants::PROOF_GENERATION_KEY_GENERATOR};

use crate::{
    primitives::{asset_type::AssetInfo, constants::ASSET_IDENTIFIER_PERSONALIZATION},
    proofs::circuit::sapling::slice_into_boolean_vec_le,
};

/// Info Needed:
/// - Amount
/// - Identifier
/// - Public Address

pub struct MintAsset {
    pub asset_info: Option<AssetInfo>,
    pub proof_generation_key: Option<ProofGenerationKey>,

    /// The authentication path of the commitment in the tree
    pub auth_path: Vec<Option<(bls12_381::Scalar, bool)>>,

    /// The anchor; the root of the tree. If the note being
    /// spent is zero-value, this can be anything.
    pub anchor: Option<bls12_381::Scalar>,

    pub commitment_randomness: Option<jubjub::Fr>,
}

impl Circuit<bls12_381::Scalar> for MintAsset {
    fn synthesize<CS: bellman::ConstraintSystem<bls12_381::Scalar>>(
        self,
        cs: &mut CS,
    ) -> Result<(), bellman::SynthesisError> {
        // Asset Commitment Contents
        let mut asset_commitment_contents = vec![];

        // TODO: I wonder if we could hard-code this to minimize work?
        // Not clear to me if the booleanizing is adding substantial time
        // or if it's just a by-product of the hash taking longer due to
        // more input. Also not clear if that has security implications
        // by not witnessing the bits
        let first_block_bits = slice_into_boolean_vec_le(
            cs.namespace(|| "booleanize first block"),
            Some(GH_FIRST_BLOCK),
            64 * 8,
        )?;

        assert_eq!(first_block_bits.len(), 64 * 8);

        let name_bits = slice_into_boolean_vec_le(
            cs.namespace(|| "booleanize asset info name"),
            self.asset_info.as_ref().and_then(|i| i.name().into()),
            32 * 8,
        )?;

        let public_address_bits = slice_into_boolean_vec_le(
            cs.namespace(|| "booleanize asset info public address"),
            self.asset_info
                .as_ref()
                .and_then(|i| i.public_address_bytes().into()),
            43 * 8,
        )?;

        let nonce_bits = slice_into_boolean_vec_le(
            cs.namespace(|| "booleanize asset info nonce"),
            self.asset_info
                .as_ref()
                .and_then(|i| slice::from_ref(i.nonce()).into()),
            8,
        )?;

        // Public address validation
        // Prover witnesses ak (ensures that it's on the curve)
        let ak = ecc::EdwardsPoint::witness(
            cs.namespace(|| "ak"),
            self.proof_generation_key.as_ref().map(|k| k.ak.into()),
        )?;

        // There are no sensible attacks on small order points
        // of ak (that we're aware of!) but it's a cheap check,
        // so we do it.
        ak.assert_not_small_order(cs.namespace(|| "ak not small order"))?;

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

        // Extend ivk and nf preimages with the representation of
        // nk.
        {
            let repr_nk = nk.repr(cs.namespace(|| "representation of nk"))?;

            ivk_preimage.extend(repr_nk.iter().cloned());
        }

        assert_eq!(ivk_preimage.len(), 512);

        // Compute the incoming viewing key ivk
        let mut ivk = blake2s::blake2s(
            cs.namespace(|| "computation of ivk"),
            &ivk_preimage,
            constants::CRH_IVK_PERSONALIZATION,
        )?;

        // drop_5 to ensure it's in the field
        ivk.truncate(jubjub::Fr::CAPACITY as usize);

        // Witness g_d, checking that it's on the curve.
        let g_d = {
            ecc::EdwardsPoint::witness(
                cs.namespace(|| "witness g_d"),
                self.asset_info.as_ref().and_then(|a| {
                    jubjub::ExtendedPoint::from(a.public_address().diversifier_point).into()
                }),
            )?
        };

        // Check that g_d is not small order. Technically, this check
        // is already done in the Output circuit, and this proof ensures
        // g_d is bound to a product of that check, but for defense in
        // depth let's check it anyway. It's cheap.
        g_d.assert_not_small_order(cs.namespace(|| "g_d not small order"))?;

        // Compute pk_d = g_d^ivk
        let pk_d = g_d.mul(cs.namespace(|| "compute pk_d"), &ivk)?;

        let calculated_pk_d_bits = pk_d.repr(cs.namespace(|| "representation of pk_d"))?;
        let asset_pk_d_bits = &public_address_bits[88..];

        for i in 0..256 {
            boolean::Boolean::enforce_equal(
                cs.namespace(|| format!("integrity of asset generator bit {}", i)),
                &asset_pk_d_bits[i],
                &calculated_pk_d_bits[i],
            )?;
        }

        asset_commitment_contents.extend(first_block_bits);
        asset_commitment_contents.extend(name_bits);
        asset_commitment_contents.extend(public_address_bits);
        asset_commitment_contents.extend(nonce_bits);

        let mut cm = pedersen_hash::pedersen_hash(
            cs.namespace(|| "asset note content hash"),
            pedersen_hash::Personalization::NoteCommitment,
            &asset_commitment_contents,
        )?;

        {
            // Booleanize the randomness
            let rcm = boolean::field_into_boolean_vec_le(
                cs.namespace(|| "rcm"),
                self.commitment_randomness,
            )?;

            // Compute the note commitment randomness in the exponent
            let rcm = ecc::fixed_base_multiplication(
                cs.namespace(|| "computation of commitment randomness"),
                &NOTE_COMMITMENT_RANDOMNESS_GENERATOR,
                &rcm,
            )?;

            // Randomize our note commitment
            cm = cm.add(cs.namespace(|| "randomization of note commitment"), &rcm)?;
        }

        cm.get_u().inputize(cs.namespace(|| "commitment"))?;

        // This will store (least significant bit first)
        // the position of the note in the tree, for use
        // in nullifier computation.
        let mut position_bits = vec![];
        // This is an injective encoding, as cur is a
        // point in the prime order subgroup.
        let mut cur = cm.get_u().clone();

        // Ascend the merkle tree authentication path
        for (i, e) in self.auth_path.into_iter().enumerate() {
            let cs = &mut cs.namespace(|| format!("merkle tree hash {}", i));

            // Determines if the current subtree is the "right" leaf at this
            // depth of the tree.
            let cur_is_right = boolean::Boolean::from(boolean::AllocatedBit::alloc(
                cs.namespace(|| "position bit"),
                e.map(|e| e.1),
            )?);

            // Push this boolean for nullifier computation later
            position_bits.push(cur_is_right.clone());

            // Witness the authentication path element adjacent
            // at this depth.
            let path_element =
                num::AllocatedNum::alloc(cs.namespace(|| "path element"), || Ok(e.get()?.0))?;

            // Swap the two if the current subtree is on the right
            let (ul, ur) = num::AllocatedNum::conditionally_reverse(
                cs.namespace(|| "conditional reversal of preimage"),
                &cur,
                &path_element,
                &cur_is_right,
            )?;

            // We don't need to be strict, because the function is
            // collision-resistant. If the prover witnesses a congruency,
            // they will be unable to find an authentication path in the
            // tree with high probability.
            let mut preimage = vec![];
            preimage.extend(ul.to_bits_le(cs.namespace(|| "ul into bits"))?);
            preimage.extend(ur.to_bits_le(cs.namespace(|| "ur into bits"))?);

            // Compute the new subtree value
            cur = pedersen_hash::pedersen_hash(
                cs.namespace(|| "computation of pedersen hash"),
                pedersen_hash::Personalization::MerkleTree(i),
                &preimage,
            )?
            .get_u()
            .clone(); // Injective encoding
        }

        let asset_identifier = blake2s::blake2s(
            cs.namespace(|| "blake2s(asset info)"),
            &asset_commitment_contents,
            ASSET_IDENTIFIER_PERSONALIZATION,
        )?;

        multipack::pack_into_inputs(cs.namespace(|| "pack hash"), &asset_identifier)?;

        Ok(())
    }
}

#[cfg(test)]
mod test {
    use std::slice;

    use bellman::{gadgets::multipack, groth16};
    use bls12_381::Bls12;
    use group::Curve;
    use jubjub::ExtendedPoint;
    use rand::{rngs::OsRng, Rng};
    use zcash_primitives::{
        constants::{GH_FIRST_BLOCK, NOTE_COMMITMENT_RANDOMNESS_GENERATOR},
        pedersen_hash,
    };

    use crate::{
        primitives::asset_type::AssetInfo, proofs::circuit::create_asset::CreateAsset, SaplingKey, test_util::make_fake_witness_from_commitment,
    };

    use super::MintAsset;

    #[test]
    fn test_mint_asset_circuit() {
        // Test setup: create sapling keys
        let sapling_key = SaplingKey::generate_key();
        let public_address = sapling_key.generate_public_address();
        let proof_generation_key = sapling_key.sapling_proof_generation_key();

        // Test setup: create an Asset Type
        let name = "My custom asset 1";
        let asset_info =
            AssetInfo::new(name, public_address.clone()).expect("Can create a valid asset");

        let commitment_randomness = {
            let mut buffer = [0u8; 64];
            OsRng.fill(&mut buffer[..]);

            jubjub::Fr::from_bytes_wide(&buffer)
        };

        let mut commitment_plaintext: Vec<u8> = vec![];
        commitment_plaintext.extend(GH_FIRST_BLOCK);
        commitment_plaintext.extend(asset_info.name());
        commitment_plaintext.extend(asset_info.public_address_bytes());
        commitment_plaintext.extend(slice::from_ref(asset_info.nonce()));

        // TODO: Make a helper function
        let commitment_hash = jubjub::ExtendedPoint::from(pedersen_hash::pedersen_hash(
            pedersen_hash::Personalization::NoteCommitment,
            commitment_plaintext
                .into_iter()
                .flat_map(|byte| (0..8).map(move |i| ((byte >> i) & 1) == 1)),
        ));

        let commitment_full_point =
            commitment_hash + (NOTE_COMMITMENT_RANDOMNESS_GENERATOR * commitment_randomness);

        let commitment = commitment_full_point.to_affine().get_u();
        let witness = make_fake_witness_from_commitment(commitment);

        // Setup: generate parameters file. This is slow, consider using pre-built ones later
        let params = groth16::generate_random_parameters::<Bls12, _, _>(
            MintAsset {
                asset_info: None,
                proof_generation_key: None,
                commitment_randomness: None,
                auth_path: None,
                anchor: None,
            },
            &mut OsRng,
        )
        .expect("Can generate random params");
        let pvk = groth16::prepare_verifying_key(&params.vk);

        let identifier_bits = multipack::bytes_to_bits_le(asset_info.asset_type().get_identifier());
        let inputs = multipack::compute_multipacking(&identifier_bits);

        // Create proof
        let circuit = MintAsset {
            asset_info: Some(asset_info),
            proof_generation_key: Some(proof_generation_key),
            commitment_randomness: Some(commitment_randomness),
            auth_path: witness.auth_path,
            anchor: Some(witness.root_hash),
        };
        let proof =
            groth16::create_random_proof(circuit, &params, &mut OsRng).expect("Create valid proof");

        // Verify proof
        groth16::verify_proof(&pvk, &proof, &inputs).expect("Can verify proof");

        // Sanity check that this fails with different inputs
        let bad_name = "My custom asset 2";
        let bad_asset_info =
            AssetInfo::new(bad_name, public_address).expect("Can create a valid asset");

        let bad_identifier_bits =
            multipack::bytes_to_bits_le(bad_asset_info.asset_type().get_identifier());
        let bad_inputs = multipack::compute_multipacking(&bad_identifier_bits);

        assert!(groth16::verify_proof(&pvk, &proof, &bad_inputs).is_err());
    }

    #[test]
    fn test_create_and_mint_asset_circuit() {
        // Setup: generate parameters file. This is slow, consider using pre-built ones later
        let create_asset_params = groth16::generate_random_parameters::<Bls12, _, _>(
            CreateAsset {
                asset_info: None,
                commitment_randomness: None,
            },
            &mut OsRng,
        )
        .expect("Can generate random params");
        let create_asset_pvk = groth16::prepare_verifying_key(&create_asset_params.vk);

        // Test setup: create sapling keys
        let sapling_key = SaplingKey::generate_key();
        let public_address = sapling_key.generate_public_address();
        let proof_generation_key = sapling_key.sapling_proof_generation_key();

        // Test setup: create an Asset Type
        let name = "My custom asset 1";
        let asset_info =
            AssetInfo::new(name, public_address.clone()).expect("Can create a valid asset");

        let generator_affine = asset_info.asset_type().asset_generator().to_affine();

        let commitment_randomness = {
            let mut buffer = [0u8; 64];
            OsRng.fill(&mut buffer[..]);

            jubjub::Fr::from_bytes_wide(&buffer)
        };

        let mut commitment_plaintext: Vec<u8> = vec![];
        commitment_plaintext.extend(GH_FIRST_BLOCK);
        commitment_plaintext.extend(asset_info.name());
        commitment_plaintext.extend(asset_info.public_address_bytes());
        commitment_plaintext.extend(slice::from_ref(asset_info.nonce()));

        // TODO: Make a helper function
        let commitment_hash = jubjub::ExtendedPoint::from(pedersen_hash::pedersen_hash(
            pedersen_hash::Personalization::NoteCommitment,
            commitment_plaintext
                .into_iter()
                .flat_map(|byte| (0..8).map(move |i| ((byte >> i) & 1) == 1)),
        ));

        let commitment_full_point =
            commitment_hash + (NOTE_COMMITMENT_RANDOMNESS_GENERATOR * commitment_randomness);

        let commitment = commitment_full_point.to_affine().get_u();

        let inputs = [
            generator_affine.get_u(),
            generator_affine.get_v(),
            commitment,
        ];

        // Create proof
        let circuit = CreateAsset {
            asset_info: Some(asset_info.clone()),
            commitment_randomness: Some(commitment_randomness),
        };
        let proof = groth16::create_random_proof(circuit, &create_asset_params, &mut OsRng)
            .expect("Create valid proof");

        // Verify proof
        groth16::verify_proof(&create_asset_pvk, &proof, &inputs).expect("Can verify proof");

        // Setup: generate parameters file. This is slow, consider using pre-built ones later
        let mint_asset_params = groth16::generate_random_parameters::<Bls12, _, _>(
            MintAsset {
                asset_info: None,
                proof_generation_key: None,
            },
            &mut OsRng,
        )
        .expect("Can generate random params");
        let mint_asset_pvk = groth16::prepare_verifying_key(&mint_asset_params.vk);

        let identifier_bits = multipack::bytes_to_bits_le(asset_info.asset_type().get_identifier());
        let inputs = multipack::compute_multipacking(&identifier_bits);

        // Create proof
        let circuit = MintAsset {
            asset_info: Some(asset_info),
            proof_generation_key: Some(proof_generation_key),
        };
        let proof = groth16::create_random_proof(circuit, &mint_asset_params, &mut OsRng)
            .expect("Create valid proof");

        // Verify proof
        groth16::verify_proof(&mint_asset_pvk, &proof, &inputs).expect("Can verify proof");
    }
}
