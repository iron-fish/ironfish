use ff::PrimeField;
use group::Curve;

use bellman::{Circuit, ConstraintSystem, SynthesisError};

use jubjub::SubgroupPoint;

use zcash_proofs::{
    circuit::{
        ecc::{self},
        pedersen_hash,
    },
    constants::NOTE_COMMITMENT_RANDOMNESS_GENERATOR,
};

use crate::{constants::proof::PUBLIC_KEY_GENERATOR, ValueCommitment};

use super::util::expose_value_commitment;
use bellman::gadgets::boolean;

/// This is a circuit instance inspired from ZCash's `Output` circuit in the Sapling protocol
/// https://github.com/zcash/librustzcash/blob/main/zcash_proofs/src/circuit/sapling.rs#L57-L70
pub struct Output {
    /// Pedersen commitment to the value being spent
    pub value_commitment: Option<ValueCommitment>,

    /// Asset generator derived from the asset identifier
    pub asset_generator: Option<jubjub::ExtendedPoint>,

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

        let asset_generator =
            ecc::EdwardsPoint::witness(cs.namespace(|| "asset_generator"), self.asset_generator)?;
        note_contents
            .extend(asset_generator.repr(cs.namespace(|| "representation of asset_generator"))?);

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

        assert_eq!(
            note_contents.len(),
            256 + // asset generator
            64 + // value
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
    use zcash_primitives::constants::VALUE_COMMITMENT_VALUE_GENERATOR;
    use zcash_primitives::sapling::Note;
    use zcash_primitives::sapling::{ProofGenerationKey, Rseed};

    use crate::{
        circuits::output::Output, constants::PUBLIC_KEY_GENERATOR, util::commitment_full_point,
        ValueCommitment,
    };

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
                asset_generator: VALUE_COMMITMENT_VALUE_GENERATOR,
            };

            let nsk = jubjub::Fr::random(&mut rng);
            let ak = jubjub::SubgroupPoint::random(&mut rng);

            let proof_generation_key = ProofGenerationKey { ak, nsk };

            let viewing_key = proof_generation_key.to_viewing_key();

            let payment_address = PUBLIC_KEY_GENERATOR * viewing_key.ivk().0;

            let commitment_randomness = jubjub::Fr::random(&mut rng);
            let esk = jubjub::Fr::random(&mut rng);

            {
                let mut cs = TestConstraintSystem::new();

                let instance = Output {
                    value_commitment: Some(value_commitment.clone()),
                    payment_address: Some(payment_address),
                    commitment_randomness: Some(commitment_randomness),
                    esk: Some(esk),
                    asset_generator: Some(VALUE_COMMITMENT_VALUE_GENERATOR.into()),
                };

                instance.synthesize(&mut cs).unwrap();

                assert!(cs.is_satisfied());
                assert_eq!(cs.num_constraints(), 5926);
                assert_eq!(
                    cs.hash(),
                    "fe17a277936c74ef5dc404f014871aa59a300b00f0528cd8db1d9d07a55dfbf1"
                );

                let note = Some(Note {
                    value: value_commitment.value,
                    rseed: Rseed::BeforeZip212(commitment_randomness),
                    g_d: PUBLIC_KEY_GENERATOR,
                    pk_d: payment_address,
                })
                .expect("should be valid");

                let commitment = commitment_full_point(
                    value_commitment.asset_generator,
                    value_commitment.value,
                    payment_address,
                    note.rcm(),
                );
                let expected_cmu = jubjub::ExtendedPoint::from(commitment).to_affine().get_u();

                let expected_value_commitment =
                    jubjub::ExtendedPoint::from(value_commitment.commitment()).to_affine();

                let expected_epk =
                    jubjub::ExtendedPoint::from(PUBLIC_KEY_GENERATOR * esk).to_affine();

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
