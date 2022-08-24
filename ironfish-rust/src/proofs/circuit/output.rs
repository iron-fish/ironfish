use ff::PrimeField;
use group::Curve;

use bellman::{Circuit, ConstraintSystem, SynthesisError};

use jubjub::ExtendedPoint;
use zcash_primitives::constants;

use zcash_primitives::primitives::{PaymentAddress, ProofGenerationKey};

use bellman::gadgets::blake2s;
use bellman::gadgets::boolean::{self, AllocatedBit, Boolean};
use bellman::gadgets::multipack;
use bellman::gadgets::num;
use bellman::gadgets::Assignment;
use zcash_proofs::circuit::ecc::EdwardsPoint;
use zcash_proofs::circuit::{ecc, pedersen_hash};
use zcash_proofs::constants::{
    NOTE_COMMITMENT_RANDOMNESS_GENERATOR, NULLIFIER_POSITION_GENERATOR,
    PROOF_GENERATION_KEY_GENERATOR, SPENDING_KEY_GENERATOR, VALUE_COMMITMENT_RANDOMNESS_GENERATOR,
};

use crate::primitives::asset_type::AssetType;
use crate::primitives::sapling::ValueCommitment;
use crate::proofs::circuit::sapling::{expose_value_commitment, hash_into_boolean_vec_le};

/// This is an output circuit instance.
pub struct Output {
    // TODO: Should we pass this in anymore, or just rely on asset type? Feels like this could lead to accidental bugs.
    /// Pedersen commitment to the value being spent
    pub value_commitment: Option<ValueCommitment>,

    /// Asset Type
    pub asset_type: Option<AssetType>,

    /// The payment address of the recipient
    pub payment_address: Option<PaymentAddress>,

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
        // asset_generator, value (big endian), g_d, p_k
        let mut note_contents = vec![];

        // Booleanize asset_identifier
        let asset_identifier = hash_into_boolean_vec_le(
            cs.namespace(|| "asset_identifier"),
            self.asset_type
                .as_ref()
                .and_then(|at| at.get_identifier().into()),
        )?;

        // Ensure the preimage of the generator is 32 bytes
        assert_eq!(256, asset_identifier.len());

        // Compute the asset generator from the asset identifier
        let asset_generator_image = blake2s::blake2s(
            cs.namespace(|| "value base computation"),
            &asset_identifier,
            constants::VALUE_COMMITMENT_GENERATOR_PERSONALIZATION,
        )?;

        // Witness the asset type
        let asset_generator = ecc::EdwardsPoint::witness(
            cs.namespace(|| "asset_generator"),
            self.asset_type
                .as_ref()
                .and_then(|at| at.asset_generator().into()),
        )?;

        let value_commitment_generator = ecc::EdwardsPoint::witness(
            cs.namespace(|| "value commitment generator"),
            self.asset_type
                .as_ref()
                .and_then(|at| ExtendedPoint::from(at.value_commitment_generator()).into()),
        )?;

        let asset_generator_bits =
            asset_generator.repr(cs.namespace(|| "unpack asset_generator"))?;

        value_commitment_generator
            .assert_not_small_order(cs.namespace(|| "asset_generator not small order"))?;

        // Check integrity of the asset generator
        // The following 256 constraints may not be strictly
        // necessary; the output of the BLAKE2s hash may be
        // interpreted directly as a curve point instead
        // However, witnessing the asset generator separately
        // and checking equality to the image of the hash
        // is conceptually clear and not particularly expensive
        for i in 0..256 {
            boolean::Boolean::enforce_equal(
                cs.namespace(|| format!("integrity of asset generator bit {}", i)),
                &asset_generator_bits[i],
                &asset_generator_image[i],
            )?;
        }

        note_contents.extend(asset_generator_bits);

        // Expose the value commitment and place the value
        // in the note.
        note_contents.extend(expose_value_commitment(
            cs.namespace(|| "value commitment"),
            value_commitment_generator,
            self.value_commitment,
        )?);

        // Let's deal with g_d
        {
            // Prover witnesses g_d, ensuring it's on the
            // curve.
            let g_d = ecc::EdwardsPoint::witness(
                cs.namespace(|| "witness g_d"),
                self.payment_address
                    .as_ref()
                    .and_then(|a| a.g_d().map(jubjub::ExtendedPoint::from)),
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
                .map(|e| jubjub::ExtendedPoint::from(*e.pk_d()).to_affine());

            // Witness the v-coordinate, encoded as little
            // endian bits (to match the representation)
            let v_contents = boolean::field_into_boolean_vec_le(
                cs.namespace(|| "pk_d bits of v"),
                pk_d.map(|e| e.get_v()),
            )?;

            // Witness the sign bit
            let sign_bit = boolean::Boolean::from(boolean::AllocatedBit::alloc(
                cs.namespace(|| "pk_d bit of u"),
                pk_d.map(|e| e.get_u().is_odd()),
            )?);

            // Extend the note with pk_d representation
            note_contents.extend(v_contents);
            note_contents.push(sign_bit);
        }

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
