use ff::PrimeField;

use bellman::{gadgets::blake2s, Circuit, ConstraintSystem, SynthesisError};

use group::Curve;
use jubjub::SubgroupPoint;

use zcash_primitives::sapling::ProofGenerationKey;
use zcash_proofs::{
    circuit::{ecc, pedersen_hash},
    constants::{
        NOTE_COMMITMENT_RANDOMNESS_GENERATOR, PROOF_GENERATION_KEY_GENERATOR,
        SPENDING_KEY_GENERATOR,
    },
};

use crate::{
    circuits::util::assert_valid_asset_generator,
    constants::{proof::PUBLIC_KEY_GENERATOR, ASSET_ID_LENGTH, CRH_IVK_PERSONALIZATION},
    primitives::ValueCommitment,
};

use super::util::expose_value_commitment;
use bellman::gadgets::boolean;

/// This is a circuit instance inspired from ZCash's `Output` circuit in the Sapling protocol
/// https://github.com/zcash/librustzcash/blob/main/zcash_proofs/src/circuit/sapling.rs#L57-L70
pub struct Output {
    /// Pedersen commitment to the value being spent
    pub value_commitment: Option<ValueCommitment>,

    /// Asset id that derived the asset generator in the value commitment
    pub asset_id: [u8; ASSET_ID_LENGTH],

    /// The payment address of the recipient
    pub payment_address: Option<SubgroupPoint>,

    /// The randomness used to hide the note commitment data
    pub commitment_randomness: Option<jubjub::Fr>,

    /// The ephemeral secret key for DH with recipient
    pub esk: Option<jubjub::Fr>,

    /// Key required to construct proofs for spending notes
    /// for a particular spending key
    pub proof_generation_key: Option<ProofGenerationKey>,

    /// Re-randomization of the public key
    pub ar: Option<jubjub::Fr>,
}

impl Circuit<bls12_381::Scalar> for Output {
    fn synthesize<CS: ConstraintSystem<bls12_381::Scalar>>(
        self,
        cs: &mut CS,
    ) -> Result<(), SynthesisError> {
        // TODO: This code is nearly identical to Spend code, before merging consider abstracting if needed
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
            let ar = boolean::field_into_boolean_vec_le(cs.namespace(|| "ar"), self.ar)?;

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
            CRH_IVK_PERSONALIZATION,
        )?;

        // drop_5 to ensure it's in the field
        ivk.truncate(jubjub::Fr::CAPACITY as usize);

        // Compute pk_d
        let pk_d_sender = ecc::fixed_base_multiplication(
            cs.namespace(|| "compute pk_d"),
            &PUBLIC_KEY_GENERATOR,
            &ivk,
        )?;
        // Let's start to construct our note, which contains
        // value (big endian)
        let mut note_contents = vec![];

        let asset_generator = ecc::EdwardsPoint::witness(
            cs.namespace(|| "asset_generator"),
            self.value_commitment.as_ref().map(|vc| vc.asset_generator),
        )?;

        let asset_generator_repr =
            asset_generator.repr(cs.namespace(|| "representation of asset_generator"))?;

        assert_valid_asset_generator(
            cs.namespace(|| "assert asset generator equality"),
            &self.asset_id,
            &asset_generator_repr,
        )?;

        note_contents.extend(asset_generator_repr);

        // Expose the value commitment and place the value
        // in the note.
        note_contents.extend(expose_value_commitment(
            cs.namespace(|| "value commitment"),
            asset_generator,
            self.value_commitment,
        )?);

        // Let's deal with ephemeral public key
        {
            // Booleanize our ephemeral secret key
            let esk = boolean::field_into_boolean_vec_le(cs.namespace(|| "esk"), self.esk)?;

            // Create the ephemeral public key from g_d.
            let epk = ecc::fixed_base_multiplication(
                cs.namespace(|| "epk computation"),
                &PUBLIC_KEY_GENERATOR,
                &esk,
            )?;

            // Expose epk publicly.
            epk.inputize(cs.namespace(|| "epk"))?;
        }

        // Now let's deal with pk_d. We don't do any checks and
        // essentially allow the prover to witness any 256 bits
        // they would like.
        {
            // Just grab pk_d from the witness
            let pk_d = self
                .payment_address
                .as_ref()
                .map(|e| jubjub::ExtendedPoint::from(*e).to_affine());

            // Witness the v-coordinate, encoded as little
            // endian bits (to match the representation)
            let v_contents = boolean::field_into_boolean_vec_le(
                cs.namespace(|| "pk_d bits of v"),
                pk_d.map(|e| e.get_v()),
            )?;

            // Witness the sign bit
            let sign_bit = boolean::Boolean::from(boolean::AllocatedBit::alloc(
                cs.namespace(|| "pk_d bit of u"),
                pk_d.map(|e| e.get_u().is_odd().into()),
            )?);

            // Extend the note with pk_d representation
            note_contents.extend(v_contents);
            note_contents.push(sign_bit);
        }
        // Place pk_d in the note
        note_contents.extend(pk_d_sender.repr(cs.namespace(|| "representation of pk_d sender"))?);

        assert_eq!(
            note_contents.len(),
            256 + // asset generator
            64 + // value
            256 + // pk_d owner
            256 // pk_d sender
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
    use bellman::{gadgets::test::*, Circuit};
    use ff::Field;
    use group::{Curve, Group};
    use rand::rngs::StdRng;
    use rand::{Rng, RngCore, SeedableRng};
    use zcash_primitives::sapling::ProofGenerationKey;

    use crate::util::asset_hash_to_point;
    use crate::{
        circuits::output::Output, constants::PUBLIC_KEY_GENERATOR, primitives::ValueCommitment,
        util::commitment_full_point,
    };

    #[test]
    fn test_output_circuit_with_bls12_381() {
        // Seed a fixed rng for determinism in the test
        let mut rng = StdRng::seed_from_u64(0);

        for _ in 0..5 {
            let mut asset_id = [0u8; 32];
            let asset_generator = loop {
                rng.fill(&mut asset_id[..]);

                if let Some(point) = asset_hash_to_point(&asset_id) {
                    break point;
                }
            };

            let value_commitment_randomness = jubjub::Fr::random(&mut rng);
            let note_commitment_randomness = jubjub::Fr::random(&mut rng);
            let value_commitment = ValueCommitment {
                value: rng.next_u64(),
                randomness: value_commitment_randomness,
                asset_generator,
            };

            let nsk = jubjub::Fr::random(&mut rng);
            let ak = jubjub::SubgroupPoint::random(&mut rng);
            let esk = jubjub::Fr::random(&mut rng);
            let ar = jubjub::Fr::random(&mut rng);

            let proof_generation_key = ProofGenerationKey { ak, nsk };

            let viewing_key = proof_generation_key.to_viewing_key();

            let payment_address = PUBLIC_KEY_GENERATOR * viewing_key.ivk().0;

            let sender_address = payment_address;

            {
                let rk = jubjub::ExtendedPoint::from(viewing_key.rk(ar)).to_affine();
                let mut cs = TestConstraintSystem::new();

                let instance = Output {
                    value_commitment: Some(value_commitment.clone()),
                    payment_address: Some(payment_address),
                    commitment_randomness: Some(note_commitment_randomness),
                    esk: Some(esk),
                    asset_id,
                    proof_generation_key: Some(proof_generation_key.clone()),
                    ar: Some(ar),
                };

                instance.synthesize(&mut cs).unwrap();

                assert!(cs.is_satisfied());
                assert_eq!(cs.num_constraints(), 54009);
                assert_eq!(
                    cs.hash(),
                    "c34430aa14387607c190af7d3d086c8c8e793e9aef640a34be834efeaff39e01"
                );

                let commitment = commitment_full_point(
                    value_commitment.asset_generator,
                    value_commitment.value,
                    payment_address,
                    note_commitment_randomness,
                    sender_address,
                );
                let expected_cmu = jubjub::ExtendedPoint::from(commitment).to_affine().get_u();

                let expected_value_commitment =
                    jubjub::ExtendedPoint::from(value_commitment.commitment()).to_affine();

                let expected_epk =
                    jubjub::ExtendedPoint::from(PUBLIC_KEY_GENERATOR * esk).to_affine();

                assert_eq!(cs.num_inputs(), 8);
                assert_eq!(cs.get_input(0, "ONE"), bls12_381::Scalar::one());
                assert_eq!(cs.get_input(1, "rk/u/input variable"), rk.get_u());
                assert_eq!(cs.get_input(2, "rk/v/input variable"), rk.get_v());
                assert_eq!(
                    cs.get_input(3, "value commitment/commitment point/u/input variable"),
                    expected_value_commitment.get_u()
                );
                assert_eq!(
                    cs.get_input(4, "value commitment/commitment point/v/input variable"),
                    expected_value_commitment.get_v()
                );
                assert_eq!(
                    cs.get_input(5, "epk/u/input variable"),
                    expected_epk.get_u()
                );
                assert_eq!(
                    cs.get_input(6, "epk/v/input variable"),
                    expected_epk.get_v()
                );
                assert_eq!(cs.get_input(7, "commitment/input variable"), expected_cmu);
            }
        }
    }
}
