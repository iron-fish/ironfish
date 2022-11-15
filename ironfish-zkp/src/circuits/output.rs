use ff::PrimeField;
use group::Curve;

use bellman::{Circuit, ConstraintSystem, SynthesisError};

use jubjub::{SubgroupPoint, ExtendedPoint};
use zcash_primitives::sapling::{PaymentAddress, ValueCommitment};

use zcash_proofs::{
    circuit::{
        ecc::{self},
        pedersen_hash,
    },
    constants::NOTE_COMMITMENT_RANDOMNESS_GENERATOR,
};

use super::util::expose_value_commitment;
use bellman::gadgets::boolean;

pub const PUBLIC_KEY_GENERATOR: SubgroupPoint = SubgroupPoint::from_raw_unchecked(
    bls12_381::Scalar::from_raw([
        0x3edc_c85f_4d1a_44cd,
        0x77ff_8c90_a9a0_d8f4,
        0x0daf_03b5_47e2_022b,
        0x6dad_65e6_2328_d37a,
    ]),
    bls12_381::Scalar::from_raw([
        0x5095_1f1f_eff0_8278,
        0xf0b7_03d5_3a3e_dd4e,
        0xca01_f580_9c00_eee2,
        0x6996_932c_ece1_f4bb,
    ]),
);

/// This is an output circuit instance.
pub struct Output {
    /// Pedersen commitment to the value being spent
    pub value_commitment: Option<ValueCommitment>,

    /// The payment address of the recipient
    pub payment_address: Option<SubgroupPoint>,

    /// The randomness used to hide the note commitment data
    pub commitment_randomness: Option<jubjub::Fr>,

    /// The ephemeral secret key for DH with recipient
    pub esk: Option<jubjub::Fr>,
}

impl Circuit<bls12_381::Scalar> for Output {
    fn synthesize<CS: ConstraintSystem<bls12_381::Scalar>>(
        self,
        cs: &mut CS,
    ) -> Result<(), SynthesisError> {
        // Let's start to construct our note, which contains
        // value (big endian)
        let mut note_contents = vec![];

        // Expose the value commitment and place the value
        // in the note.
        note_contents.extend(expose_value_commitment(
            cs.namespace(|| "value commitment"),
            self.value_commitment,
        )?);

        // Let's deal with g_d
        {
            // Prover witnesses g_d, ensuring it's on the
            // curve.
            let g_d = ecc::EdwardsPoint::witness(
                cs.namespace(|| "witness g_d"),
        Some(ExtendedPoint::from(PUBLIC_KEY_GENERATOR))
    )?;

            // g_d is ensured to be large order. The relationship
            // between g_d and pk_d ultimately binds ivk to the
            // note. If this were a small order point, it would
            // not do this correctly, and the prover could
            // double-spend by finding random ivk's that satisfy
            // the relationship.
            //
            // Further, if it were small order, epk would be
            // small order too!
            g_d.assert_not_small_order(cs.namespace(|| "g_d not small order"))?;

            // Extend our note contents with the representation of
            // g_d.
            note_contents.extend(g_d.repr(cs.namespace(|| "representation of g_d"))?);

            // Booleanize our ephemeral secret key
            let esk = boolean::field_into_boolean_vec_le(cs.namespace(|| "esk"), self.esk)?;

            // Create the ephemeral public key from g_d.
            let epk = g_d.mul(cs.namespace(|| "epk computation"), &esk)?;

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

        assert_eq!(
            note_contents.len(),
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
    use bellman::{gadgets::test::*, Circuit};
    use ff::Field;
    use group::{Curve, Group};
    use rand::{RngCore, SeedableRng};
    use rand_xorshift::XorShiftRng;
    use zcash_primitives::sapling::{ValueCommitment, Note};
    use zcash_primitives::sapling::{ProofGenerationKey, Rseed};

    use crate::circuits::output::Output;

    use super::PUBLIC_KEY_GENERATOR;

    #[test]
    fn test_output_circuit_with_bls12_381() {
        let mut rng = XorShiftRng::from_seed([
            0x58, 0x62, 0xbe, 0x3d, 0x76, 0x3d, 0x31, 0x8d, 0x17, 0xdb, 0x37, 0x32, 0x54, 0x06,
            0xbc, 0xe5,
        ]);

        for _ in 0..100 {
            let value_commitment = ValueCommitment {
                value: rng.next_u64(),
                randomness: jubjub::Fr::random(&mut rng),
            };

            let nsk = jubjub::Fr::random(&mut rng);
            let ak = jubjub::SubgroupPoint::random(&mut rng);

            let proof_generation_key = ProofGenerationKey { ak, nsk };

            let viewing_key = proof_generation_key.to_viewing_key();

            let payment_address = PUBLIC_KEY_GENERATOR * viewing_key.ivk().0  ;

            let commitment_randomness = jubjub::Fr::random(&mut rng);
            let esk = jubjub::Fr::random(&mut rng);

            {
                let mut cs = TestConstraintSystem::new();

                let instance = Output {
                    value_commitment: Some(value_commitment.clone()),
                    payment_address: Some(payment_address.clone()),
                    commitment_randomness: Some(commitment_randomness),
                    esk: Some(esk),
                };

                instance.synthesize(&mut cs).unwrap();

                assert!(cs.is_satisfied());
                assert_eq!(cs.num_constraints(), 7827);
                assert_eq!(
                    cs.hash(),
                    "c26d5cdfe6ccd65c03390902c02e11393ea6bb96aae32a7f2ecb12eb9103faee"
                );

                let expected_cmu = Some(Note {
                    value: value_commitment.value,
                    rseed: Rseed::BeforeZip212(commitment_randomness),
                    g_d: PUBLIC_KEY_GENERATOR,
                    pk_d: payment_address,
                }).expect("should be valid")
                .cmu();

                let expected_value_commitment =
                    jubjub::ExtendedPoint::from(value_commitment.commitment()).to_affine();

                let expected_epk = jubjub::ExtendedPoint::from(
                    PUBLIC_KEY_GENERATOR * esk,
                )
                .to_affine();

                assert_eq!(cs.num_inputs(), 6);
                assert_eq!(cs.get_input(0, "ONE"), bls12_381::Scalar::one());
                assert_eq!(
                    cs.get_input(1, "value commitment/commitment point/u/input variable"),
                    expected_value_commitment.get_u()
                );
                assert_eq!(
                    cs.get_input(2, "value commitment/commitment point/v/input variable"),
                    expected_value_commitment.get_v()
                );
                assert_eq!(
                    cs.get_input(3, "epk/u/input variable"),
                    expected_epk.get_u()
                );
                assert_eq!(
                    cs.get_input(4, "epk/v/input variable"),
                    expected_epk.get_v()
                );
                assert_eq!(cs.get_input(5, "commitment/input variable"), expected_cmu);
            }
        }
    }
}
