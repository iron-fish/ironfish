use std::slice;

use bellman::{
    gadgets::{blake2s, boolean, multipack, num, Assignment},
    Circuit, ConstraintSystem,
};
use ff::PrimeField;
use jubjub::ExtendedPoint;
use zcash_primitives::{
    constants::{self, GH_FIRST_BLOCK},
    primitives::ProofGenerationKey,
};
use zcash_proofs::{circuit::ecc, constants::PROOF_GENERATION_KEY_GENERATOR};
use zcash_proofs::{circuit::pedersen_hash, constants::NOTE_COMMITMENT_RANDOMNESS_GENERATOR};

use crate::{
    primitives::{
        asset_type::AssetInfo, constants::ASSET_IDENTIFIER_PERSONALIZATION,
        sapling::ValueCommitment,
    },
    proofs::circuit::sapling::{expose_value_commitment, slice_into_boolean_vec_le},
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

    // TODO: Should we pass this in anymore, or just rely on asset type? Feels like this could lead to accidental bugs.
    /// Pedersen commitment to the value being spent
    pub value_commitment: Option<ValueCommitment>,
}

impl Circuit<bls12_381::Scalar> for MintAsset {
    fn synthesize<CS: bellman::ConstraintSystem<bls12_381::Scalar>>(
        self,
        cs: &mut CS,
    ) -> Result<(), bellman::SynthesisError> {
        // Asset Commitment Contents
        let mut identifier_commitment_contents = vec![];

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

        let asset_type = self
            .asset_info
            .as_ref()
            .and_then(|ai| Some(ai.asset_type()));
        // Witness the asset type
        // TODO: Does this properly verify that the spend note is the right asset generator?
        // Could this be spoofed, or does this not matter? Need to consider what's public/private
        // In other words: Does this verify that the actual note's asset generator is valid
        // Or are we allowing this to be _any_ generator
        let asset_generator = ecc::EdwardsPoint::witness(
            cs.namespace(|| "asset_generator"),
            asset_type
                .as_ref()
                .and_then(|at| at.asset_generator().into()),
        )?;

        let value_commitment_generator = ecc::EdwardsPoint::witness(
            cs.namespace(|| "value commitment generator"),
            asset_type
                .as_ref()
                .and_then(|at| ExtendedPoint::from(at.value_commitment_generator()).into()),
        )?;

        value_commitment_generator.assert_not_small_order(
            cs.namespace(|| "value_commitment_generator not small order"),
        )?;

        let calculated_pk_d_bits = pk_d.repr(cs.namespace(|| "representation of pk_d"))?;
        let asset_pk_d_bits = &public_address_bits[88..];

        for i in 0..256 {
            boolean::Boolean::enforce_equal(
                cs.namespace(|| format!("integrity of asset generator bit {}", i)),
                &asset_pk_d_bits[i],
                &calculated_pk_d_bits[i],
            )?;
        }

        identifier_commitment_contents.extend(first_block_bits);
        identifier_commitment_contents.extend(name_bits);
        identifier_commitment_contents.extend(public_address_bits);
        identifier_commitment_contents.extend(nonce_bits);

        let asset_identifier = blake2s::blake2s(
            cs.namespace(|| "blake2s(asset info)"),
            &identifier_commitment_contents,
            ASSET_IDENTIFIER_PERSONALIZATION,
        )?;

        multipack::pack_into_inputs(cs.namespace(|| "pack hash"), &asset_identifier)?;

        let mut cm = pedersen_hash::pedersen_hash(
            cs.namespace(|| "asset note content hash"),
            pedersen_hash::Personalization::NoteCommitment,
            &identifier_commitment_contents,
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

        {
            let real_anchor_value = self.anchor;

            // Allocate the "real" anchor that will be exposed.
            let rt = num::AllocatedNum::alloc(cs.namespace(|| "conditional anchor"), || {
                Ok(*real_anchor_value.get()?)
            })?;

            // (cur - rt) * 1 = 0
            cs.enforce(
                || "conditionally enforce correct root",
                |lc| lc + cur.get_variable() - rt.get_variable(),
                |lc| lc + CS::one(),
                |lc| lc,
            );

            // Expose the anchor
            rt.inputize(cs.namespace(|| "anchor"))?;
        }

        // Compute note contents:
        // asset_generator, value (in big endian), g_d, pk_d
        let mut note_contents = vec![];

        // Place asset_generator in the note
        note_contents
            .extend(asset_generator.repr(cs.namespace(|| "representation of asset_generator"))?);

        // Handle the value; we'll need it later for the
        // dummy input check.
        let mut value_num = num::Num::zero();
        {
            // Get the value in little-endian bit order
            let value_bits = expose_value_commitment(
                cs.namespace(|| "value commitment"),
                value_commitment_generator,
                self.value_commitment,
            )?;

            // Compute the note's value as a linear combination
            // of the bits.
            let mut coeff = bls12_381::Scalar::one();
            for bit in &value_bits {
                value_num = value_num.add_bool_with_coeff(CS::one(), bit, coeff);
                coeff = coeff.double();
            }

            // Place the value in the note
            note_contents.extend(value_bits);
        }

        // Place g_d in the note
        note_contents.extend(g_d.repr(cs.namespace(|| "representation of g_d"))?);

        // Place pk_d in the note
        note_contents.extend(pk_d.repr(cs.namespace(|| "representation of pk_d"))?);

        assert_eq!(
            note_contents.len(),
            256 + // asset_generator
            64 + // value
            256 + // g_d
            256 // pk_d
        );

        // Compute the hash of the note contents
        let mut cm = pedersen_hash::pedersen_hash(
            cs.namespace(|| "note content hash"),
            pedersen_hash::Personalization::NoteCommitment,
            &note_contents,
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

        // Only the u-coordinate of the output is revealed,
        // since we know it is prime order, and we know that
        // the u-coordinate is an injective encoding for
        // elements in the prime-order subgroup.
        cm.get_u().inputize(cs.namespace(|| "commitment"))?;

        Ok(())
    }
}

#[cfg(test)]
mod test {
    use std::slice;

    use bellman::{
        gadgets::{multipack, test::TestConstraintSystem},
        groth16, Circuit,
    };
    use blake2s_simd::Params as Blake2sParams;
    use bls12_381::{Bls12, Scalar};
    use byteorder::{LittleEndian, WriteBytesExt};
    use group::{Curve, GroupEncoding};
    use jubjub::ExtendedPoint;
    use rand::{rngs::OsRng, thread_rng, Rng};
    use zcash_primitives::{
        constants::{
            self, GH_FIRST_BLOCK, NOTE_COMMITMENT_RANDOMNESS_GENERATOR, SPENDING_KEY_GENERATOR,
        },
        pedersen_hash,
        primitives::Nullifier,
        redjubjub,
    };

    use crate::{
        merkle_note::{position as witness_position, sapling_auth_path},
        primitives::asset_type::AssetInfo,
        proofs::circuit::{create_asset::CreateAsset, sapling::TREE_DEPTH, spend::Spend},
        sapling_bls12,
        test_util::make_fake_witness_from_commitment,
        witness::WitnessTrait,
        SaplingKey, SpendProof,
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

        let value = 1;
        // Calculate the note contents, as bytes
        let mut note_contents = vec![];

        // Write the asset generator, cofactor not cleared
        note_contents.extend(asset_info.asset_type().asset_generator().to_bytes());

        // Writing the value in little endian
        (&mut note_contents)
            .write_u64::<LittleEndian>(value)
            .unwrap();

        // Write g_d
        note_contents.extend_from_slice(&public_address.diversifier_point.to_bytes());

        // Write pk_d
        note_contents.extend_from_slice(&public_address.transmission_key.to_bytes());

        assert_eq!(note_contents.len(), 32 + 32 + 32 + 8);

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

        let note_hash = jubjub::ExtendedPoint::from(pedersen_hash::pedersen_hash(
            pedersen_hash::Personalization::NoteCommitment,
            note_contents
                .into_iter()
                .flat_map(|byte| (0..8).map(move |i| ((byte >> i) & 1) == 1)),
        ));
        let note_full_point =
            note_hash + (NOTE_COMMITMENT_RANDOMNESS_GENERATOR * commitment_randomness);
        let note_commitment = note_full_point.to_affine().get_u();

        // Setup: generate parameters file. This is slow, consider using pre-built ones later
        let params = groth16::generate_random_parameters::<Bls12, _, _>(
            MintAsset {
                asset_info: None,
                proof_generation_key: None,
                commitment_randomness: None,
                auth_path: vec![None; TREE_DEPTH],
                anchor: None,
                value_commitment: None,
            },
            &mut OsRng,
        )
        .expect("Can generate random params");
        let pvk = groth16::prepare_verifying_key(&params.vk);

        let identifier_bits = multipack::bytes_to_bits_le(asset_info.asset_type().get_identifier());
        let identifier_inputs = multipack::compute_multipacking(&identifier_bits);

        let mut buffer = [0u8; 64];
        thread_rng().fill(&mut buffer[..]);
        let randomness = jubjub::Fr::from_bytes_wide(&buffer);
        let value_commitment = asset_info.asset_type().value_commitment(value, randomness);

        let p = ExtendedPoint::from(value_commitment.commitment()).to_affine();
        let mut inputs = vec![Scalar::zero(); 7];
        inputs[0] = identifier_inputs[0];
        inputs[1] = identifier_inputs[1];
        inputs[2] = commitment;
        inputs[3] = witness.root_hash;
        inputs[4] = p.get_u();
        inputs[5] = p.get_v();
        inputs[6] = note_commitment;

        // Create proof
        let circuit = MintAsset {
            asset_info: Some(asset_info),
            proof_generation_key: Some(proof_generation_key),
            commitment_randomness: Some(commitment_randomness),
            auth_path: sapling_auth_path(&witness),
            anchor: Some(witness.root_hash),
            value_commitment: Some(value_commitment),
        };
        let proof =
            groth16::create_random_proof(circuit, &params, &mut OsRng).expect("Create valid proof");

        // Verify proof
        groth16::verify_proof(&pvk, &proof, &inputs[..]).expect("Can verify proof");

        // Sanity check that this fails with different inputs
        let bad_name = "My custom asset 2";
        let bad_asset_info =
            AssetInfo::new(bad_name, public_address).expect("Can create a valid asset");

        let bad_identifier_bits =
            multipack::bytes_to_bits_le(bad_asset_info.asset_type().get_identifier());
        let bad_inputs = multipack::compute_multipacking(&bad_identifier_bits);

        // TODO: These are failing for the wrong reason (incorrect number of inputs)
        assert!(groth16::verify_proof(&pvk, &proof, &bad_inputs).is_err());
    }

    #[test]
    fn test_mint_constraints() {
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

        let value = 1;
        // Calculate the note contents, as bytes
        let mut note_contents = vec![];

        // Write the asset generator, cofactor not cleared
        note_contents.extend(asset_info.asset_type().asset_generator().to_bytes());

        // Writing the value in little endian
        (&mut note_contents)
            .write_u64::<LittleEndian>(value)
            .unwrap();

        // Write g_d
        note_contents.extend_from_slice(&public_address.diversifier_point.to_bytes());

        // Write pk_d
        note_contents.extend_from_slice(&public_address.transmission_key.to_bytes());

        assert_eq!(note_contents.len(), 32 + 32 + 32 + 8);

        // TODO: Make a helper function
        let commitment_hash = jubjub::ExtendedPoint::from(pedersen_hash::pedersen_hash(
            pedersen_hash::Personalization::NoteCommitment,
            commitment_plaintext
                .clone()
                .into_iter()
                .flat_map(|byte| (0..8).map(move |i| ((byte >> i) & 1) == 1)),
        ));

        let commitment_full_point =
            commitment_hash + (NOTE_COMMITMENT_RANDOMNESS_GENERATOR * commitment_randomness);

        let commitment = commitment_full_point.to_affine().get_u();
        let witness = make_fake_witness_from_commitment(commitment);

        let identifier_bits = multipack::bytes_to_bits_le(asset_info.asset_type().get_identifier());
        let identifier_inputs = multipack::compute_multipacking(&identifier_bits);

        let note_hash = jubjub::ExtendedPoint::from(pedersen_hash::pedersen_hash(
            pedersen_hash::Personalization::NoteCommitment,
            note_contents
                .into_iter()
                .flat_map(|byte| (0..8).map(move |i| ((byte >> i) & 1) == 1)),
        ));
        let note_full_point =
            note_hash + (NOTE_COMMITMENT_RANDOMNESS_GENERATOR * commitment_randomness);
        let note_commitment = note_full_point.to_affine().get_u();

        let mut buffer = [0u8; 64];
        thread_rng().fill(&mut buffer[..]);
        let randomness = jubjub::Fr::from_bytes_wide(&buffer);
        let value_commitment = asset_info.asset_type().value_commitment(value, randomness);

        let p = ExtendedPoint::from(value_commitment.commitment()).to_affine();
        let mut inputs = vec![Scalar::zero(); 7];
        inputs[0] = identifier_inputs[0];
        inputs[1] = identifier_inputs[1];
        inputs[2] = commitment;
        inputs[3] = witness.root_hash;
        inputs[4] = p.get_u();
        inputs[5] = p.get_v();
        inputs[6] = note_commitment;

        // Create proof
        let mut cs = TestConstraintSystem::new();

        let circuit = MintAsset {
            asset_info: Some(asset_info),
            proof_generation_key: Some(proof_generation_key),
            commitment_randomness: Some(commitment_randomness),
            auth_path: sapling_auth_path(&witness),
            anchor: Some(witness.root_hash),
            value_commitment: Some(value_commitment),
        };

        circuit.synthesize(&mut cs).unwrap();

        assert!(cs.is_satisfied());
        assert!(cs.verify(&inputs));
        // assert_eq!(cs.num_constraints(), 1);
        // assert_eq!(cs.hash(), "asdf");
    }

    #[test]
    fn test_create_mint_asset_and_spend_circuit() {
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

        let mut identifier_plaintext: Vec<u8> = vec![];
        identifier_plaintext.extend(GH_FIRST_BLOCK);
        identifier_plaintext.extend(asset_info.name());
        identifier_plaintext.extend(asset_info.public_address_bytes());
        identifier_plaintext.extend(slice::from_ref(asset_info.nonce()));

        let value = 1;
        // Calculate the note contents, as bytes
        let mut note_contents = vec![];

        // Write the asset generator, cofactor not cleared
        note_contents.extend(asset_info.asset_type().asset_generator().to_bytes());

        // Writing the value in little endian
        (&mut note_contents)
            .write_u64::<LittleEndian>(value)
            .unwrap();

        // Write g_d
        note_contents.extend_from_slice(&public_address.diversifier_point.to_bytes());

        // Write pk_d
        note_contents.extend_from_slice(&public_address.transmission_key.to_bytes());

        assert_eq!(note_contents.len(), 32 + 32 + 32 + 8);

        // TODO: Make a helper function
        let commitment_hash = jubjub::ExtendedPoint::from(pedersen_hash::pedersen_hash(
            pedersen_hash::Personalization::NoteCommitment,
            identifier_plaintext
                .clone()
                .into_iter()
                .flat_map(|byte| (0..8).map(move |i| ((byte >> i) & 1) == 1)),
        ));

        let commitment_full_point =
            commitment_hash + (NOTE_COMMITMENT_RANDOMNESS_GENERATOR * commitment_randomness);

        let commitment = commitment_full_point.to_affine().get_u();
        let witness = make_fake_witness_from_commitment(commitment);

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
                commitment_randomness: None,
                auth_path: vec![None; TREE_DEPTH],
                anchor: None,
                value_commitment: None,
            },
            &mut OsRng,
        )
        .expect("Can generate random params");
        let mint_asset_pvk = groth16::prepare_verifying_key(&mint_asset_params.vk);

        let identifier_bits = multipack::bytes_to_bits_le(asset_info.asset_type().get_identifier());
        let identifier_inputs = multipack::compute_multipacking(&identifier_bits);

        let mut buffer = [0u8; 64];
        thread_rng().fill(&mut buffer[..]);
        let randomness = jubjub::Fr::from_bytes_wide(&buffer);
        let value_commitment = asset_info.asset_type().value_commitment(value, randomness);

        let note_hash = jubjub::ExtendedPoint::from(pedersen_hash::pedersen_hash(
            pedersen_hash::Personalization::NoteCommitment,
            note_contents
                .into_iter()
                .flat_map(|byte| (0..8).map(move |i| ((byte >> i) & 1) == 1)),
        ));
        let note_full_point =
            note_hash + (NOTE_COMMITMENT_RANDOMNESS_GENERATOR * commitment_randomness);
        let note_commitment = note_full_point.to_affine().get_u();
        let note_witness = make_fake_witness_from_commitment(note_commitment);

        let p = ExtendedPoint::from(value_commitment.commitment()).to_affine();
        let mut inputs = vec![Scalar::zero(); 7];
        inputs[0] = identifier_inputs[0];
        inputs[1] = identifier_inputs[1];
        inputs[2] = commitment;
        inputs[3] = witness.root_hash;
        inputs[4] = p.get_u();
        inputs[5] = p.get_v();
        inputs[6] = note_commitment;

        // Create proof
        let circuit = MintAsset {
            asset_info: Some(asset_info.clone()),
            proof_generation_key: Some(proof_generation_key.clone()),
            commitment_randomness: Some(commitment_randomness),
            auth_path: sapling_auth_path(&witness),
            anchor: Some(witness.root_hash),
            value_commitment: Some(value_commitment.clone()),
        };
        let proof = groth16::create_random_proof(circuit, &mint_asset_params, &mut OsRng)
            .expect("Create valid proof");

        // Verify proof
        groth16::verify_proof(&mint_asset_pvk, &proof, &inputs).expect("Can verify proof");

        let mut buffer = [0u8; 64];
        thread_rng().fill(&mut buffer[..]);
        let public_key_randomness = jubjub::Fr::from_bytes_wide(&buffer);

        let spend_circuit = Spend {
            value_commitment: Some(value_commitment.clone()),
            asset_type: Some(asset_info.asset_type()),
            proof_generation_key: Some(proof_generation_key),
            payment_address: Some(public_address.sapling_payment_address()),
            auth_path: sapling_auth_path(&note_witness),
            commitment_randomness: Some(commitment_randomness),
            anchor: Some(note_witness.root_hash()),
            ar: Some(public_key_randomness),
        };
        let sapling = sapling_bls12::SAPLING.clone();
        let proof =
            groth16::create_random_proof(spend_circuit, &sapling.spend_params, &mut OsRng).unwrap();

        let private_key = redjubjub::PrivateKey(sapling_key.spend_authorizing_key);
        let randomized_private_key = private_key.randomize(public_key_randomness);
        let randomized_public_key =
            redjubjub::PublicKey::from_private(&randomized_private_key, SPENDING_KEY_GENERATOR);
        let mut signature_hash = [0u8; 32];
        thread_rng().fill(&mut signature_hash[..]);

        let mut data_to_be_signed = [0; 64];
        data_to_be_signed[..32].copy_from_slice(&randomized_public_key.0.to_bytes());
        data_to_be_signed[32..].copy_from_slice(&signature_hash[..]);

        let authorizing_signature =
            randomized_private_key.sign(&data_to_be_signed, &mut OsRng, SPENDING_KEY_GENERATOR);

        // Compute rho = cm + position.G
        let rho = note_full_point
            + (constants::NULLIFIER_POSITION_GENERATOR
                * jubjub::Fr::from(witness_position(&note_witness)));

        // Compute nf = BLAKE2s(nk | rho)
        let nullifier = Nullifier::from_slice(
            Blake2sParams::new()
                .hash_length(32)
                .personal(constants::PRF_NF_PERSONALIZATION)
                .to_state()
                .update(&sapling_key.sapling_viewing_key().nk.to_bytes())
                .update(&rho.to_bytes())
                .finalize()
                .as_bytes(),
        )
        .unwrap();

        let spend_proof = SpendProof {
            proof: proof.clone(),
            value_commitment: value_commitment.commitment().into(),
            randomized_public_key,
            root_hash: note_witness.root_hash,
            tree_size: note_witness.tree_size as u32,
            nullifier: nullifier,
            authorizing_signature,
        };
        spend_proof
            .verify_proof(&sapling)
            .expect("verifies spend proof");
    }
}
