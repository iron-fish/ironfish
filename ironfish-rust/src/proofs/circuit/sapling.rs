use bellman::{
    gadgets::{blake2s, boolean, multipack, num, Assignment},
    Circuit, ConstraintSystem, SynthesisError,
};
use ff::PrimeField;
use group::Curve;
use itertools::multizip;
use zcash_primitives::{
    constants,
    primitives::{PaymentAddress, ProofGenerationKey},
};
use zcash_proofs::{
    circuit::{ecc, pedersen_hash},
    constants::{
        NOTE_COMMITMENT_RANDOMNESS_GENERATOR, NULLIFIER_POSITION_GENERATOR,
        PROOF_GENERATION_KEY_GENERATOR, SPENDING_KEY_GENERATOR,
        VALUE_COMMITMENT_RANDOMNESS_GENERATOR,
    },
};

use crate::primitives::sapling::ValueCommitment;

/// This is an instance of the `Spend` circuit.
pub struct Spend {
    /// Pedersen commitment to the value being spent
    pub value_commitment: Option<ValueCommitment>,

    /// Key required to construct proofs for spending notes
    /// for a particular spending key
    pub proof_generation_key: Option<ProofGenerationKey>,

    /// The payment address associated with the note
    pub payment_address: Option<PaymentAddress>,

    /// The randomness of the note commitment
    pub commitment_randomness: Option<jubjub::Fr>,

    /// Re-randomization of the public key
    pub ar: Option<jubjub::Fr>,

    /// The authentication path of the commitment in the tree
    pub auth_path: Vec<Option<(bls12_381::Scalar, bool)>>,

    /// The anchor; the root of the tree. If the note being
    /// spent is zero-value, this can be anything.
    pub anchor: Option<bls12_381::Scalar>,
}

/// This is an output circuit instance.
pub struct Output {
    /// Pedersen commitment to the value being spent
    pub value_commitment: Option<ValueCommitment>,

    /// Asset Type (256 bit identifier)
    pub asset_identifier: Vec<Option<bool>>,

    /// The payment address of the recipient
    pub payment_address: Option<PaymentAddress>,

    /// The randomness used to hide the note commitment data
    pub commitment_randomness: Option<jubjub::Fr>,

    /// The ephemeral secret key for DH with recipient
    pub esk: Option<jubjub::Fr>,
}

/// Exposes a Pedersen commitment to the value as an
/// input to the circuit
fn expose_value_commitment<CS>(
    mut cs: CS,
    value_commitment: Option<ValueCommitment>,
) -> Result<(Vec<boolean::Boolean>, Vec<boolean::Boolean>), SynthesisError>
where
    CS: ConstraintSystem<bls12_381::Scalar>,
{
    // Witness the asset type
    let asset_generator = ecc::EdwardsPoint::witness(
        cs.namespace(|| "asset_generator"),
        value_commitment.as_ref().map(|vc| vc.asset_generator),
    )?;

    // Booleanize the asset type
    let asset_generator_bits = asset_generator.repr(cs.namespace(|| "unpack asset_generator"))?;

    // Clear the cofactor of the asset generator, producing the value commitment generator
    let asset_generator =
        asset_generator.double(cs.namespace(|| "asset_generator first doubling"))?;
    let asset_generator =
        asset_generator.double(cs.namespace(|| "asset_generator second doubling"))?;
    let asset_generator =
        asset_generator.double(cs.namespace(|| "asset_generator third doubling"))?;

    // (0, -1) is a small order point, but won't ever appear here
    // because cofactor is 2^3, and we performed three doublings.
    // (0, 1) is the neutral element, so checking if x is nonzero
    // is sufficient to prevent small order points here.
    asset_generator
        .get_u()
        .assert_nonzero(cs.namespace(|| "check asset_generator != 0"))?;

    // Booleanize the value into little-endian bit order
    let value_bits = boolean::u64_into_boolean_vec_le(
        cs.namespace(|| "value"),
        value_commitment.as_ref().map(|c| c.value),
    )?;

    // Compute the note value in the exponent
    let value = asset_generator.mul(
        cs.namespace(|| "compute the value in the exponent"),
        &value_bits,
    )?;

    // Booleanize the randomness. This does not ensure
    // the bit representation is "in the field" because
    // it doesn't matter for security.
    let rcv = boolean::field_into_boolean_vec_le(
        cs.namespace(|| "rcv"),
        value_commitment.as_ref().map(|c| c.randomness),
    )?;

    // Compute the randomness in the exponent
    let rcv = ecc::fixed_base_multiplication(
        cs.namespace(|| "computation of rcv"),
        &VALUE_COMMITMENT_RANDOMNESS_GENERATOR,
        &rcv,
    )?;

    // Compute the Pedersen commitment to the value
    let cv = value.add(cs.namespace(|| "computation of cv"), &rcv)?;

    // Expose the commitment as an input to the circuit
    cv.inputize(cs.namespace(|| "commitment point"))?;

    Ok((asset_generator_bits, value_bits))
}

impl Circuit<bls12_381::Scalar> for Spend {
    fn synthesize<CS: ConstraintSystem<bls12_381::Scalar>>(
        self,
        cs: &mut CS,
    ) -> Result<(), SynthesisError> {
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

        // This is the nullifier preimage for PRF^nf
        let mut nf_preimage = vec![];

        // Extend ivk and nf preimages with the representation of
        // nk.
        {
            let repr_nk = nk.repr(cs.namespace(|| "representation of nk"))?;

            ivk_preimage.extend(repr_nk.iter().cloned());
            nf_preimage.extend(repr_nk);
        }

        assert_eq!(ivk_preimage.len(), 512);
        assert_eq!(nf_preimage.len(), 256);

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
                self.payment_address
                    .as_ref()
                    .and_then(|a| a.g_d().map(jubjub::ExtendedPoint::from)),
            )?
        };

        // Check that g_d is not small order. Technically, this check
        // is already done in the Output circuit, and this proof ensures
        // g_d is bound to a product of that check, but for defense in
        // depth let's check it anyway. It's cheap.
        g_d.assert_not_small_order(cs.namespace(|| "g_d not small order"))?;

        // Compute pk_d = g_d^ivk
        let pk_d = g_d.mul(cs.namespace(|| "compute pk_d"), &ivk)?;

        // Compute note contents:
        // asset_generator, then value (in big endian) followed by g_d and pk_d
        let mut note_contents = vec![];

        // Handle the value; we'll need it later for the
        // dummy input check.
        let mut value_num = num::Num::zero();
        {
            // Get the value in little-endian bit order
            let (asset_generator_bits, value_bits) = expose_value_commitment(
                cs.namespace(|| "value commitment"),
                self.value_commitment,
            )?;

            // Compute the note's value as a linear combination
            // of the bits.
            let mut coeff = bls12_381::Scalar::one();
            for bit in &value_bits {
                value_num = value_num.add_bool_with_coeff(CS::one(), bit, coeff);
                coeff = coeff.double();
            }

            // Place the asset generator in the note
            note_contents.extend(asset_generator_bits);

            // Place the value in the note
            note_contents.extend(value_bits);
        }

        // Place g_d in the note
        note_contents.extend(g_d.repr(cs.namespace(|| "representation of g_d"))?);

        // Place pk_d in the note
        note_contents.extend(pk_d.repr(cs.namespace(|| "representation of pk_d"))?);

        assert_eq!(
            note_contents.len(),
            256 + // asset_generator bits
            64 + // value
            256 + // g_d
            256 // p_d
        );

        // Compute the hash of the note contents
        let mut cm = pedersen_hash::pedersen_hash(
            cs.namespace(|| "note content hash"),
            pedersen_hash::Personalization::NoteCommitment,
            &note_contents,
        )?;

        {
            // Booleanize the randomness for the note commitment
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

            // Randomize the note commitment. Pedersen hashes are not
            // themselves hiding commitments.
            cm = cm.add(cs.namespace(|| "randomization of note commitment"), &rcm)?;
        }

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

            // (cur - rt) * value = 0
            // if value is zero, cur and rt can be different
            // if value is nonzero, they must be equal
            cs.enforce(
                || "conditionally enforce correct root",
                |lc| lc + cur.get_variable() - rt.get_variable(),
                |lc| lc + &value_num.lc(bls12_381::Scalar::one()),
                |lc| lc,
            );

            // Expose the anchor
            rt.inputize(cs.namespace(|| "anchor"))?;
        }

        // Compute the cm + g^position for preventing
        // faerie gold attacks
        let mut rho = cm;
        {
            // Compute the position in the exponent
            let position = ecc::fixed_base_multiplication(
                cs.namespace(|| "g^position"),
                &NULLIFIER_POSITION_GENERATOR,
                &position_bits,
            )?;

            // Add the position to the commitment
            rho = rho.add(cs.namespace(|| "faerie gold prevention"), &position)?;
        }

        // Let's compute nf = BLAKE2s(nk || rho)
        nf_preimage.extend(rho.repr(cs.namespace(|| "representation of rho"))?);

        assert_eq!(nf_preimage.len(), 512);

        // Compute nf
        let nf = blake2s::blake2s(
            cs.namespace(|| "nf computation"),
            &nf_preimage,
            constants::PRF_NF_PERSONALIZATION,
        )?;

        multipack::pack_into_inputs(cs.namespace(|| "pack nullifier"), &nf)
    }
}

impl Circuit<bls12_381::Scalar> for Output {
    fn synthesize<CS: ConstraintSystem<bls12_381::Scalar>>(
        self,
        cs: &mut CS,
    ) -> Result<(), SynthesisError> {
        // Let's start to construct our note, which contains
        // value (big endian)
        // asset_generator || value || g_d || pk_d
        let mut note_contents = vec![];

        // Reserve 256 bits for the preimage
        let mut asset_generator_preimage = Vec::with_capacity(256);

        // Ensure the input identifier is 32 bytes
        assert_eq!(256, self.asset_identifier.len());

        for (i, bit) in self.asset_identifier.iter().enumerate() {
            let cs = &mut cs.namespace(|| format!("witness asset type bit {}", i));

            //  Witness each bit of the asset identifier
            let asset_identifier_preimage_bit = boolean::Boolean::from(
                boolean::AllocatedBit::alloc(cs.namespace(|| "asset type bit"), *bit)?,
            );

            // Push this boolean for asset generator computation later
            asset_generator_preimage.push(asset_identifier_preimage_bit.clone());
        }

        // Ensure the preimage of the generator is 32 bytes
        assert_eq!(256, asset_generator_preimage.len());

        // Compute the asset generator from the asset identifier
        let asset_generator_image = blake2s::blake2s(
            cs.namespace(|| "value base computation"),
            &asset_generator_preimage,
            constants::VALUE_COMMITMENT_GENERATOR_PERSONALIZATION,
        )?;

        // Expose the value commitment
        let (asset_generator_bits, value_bits) =
            expose_value_commitment(cs.namespace(|| "value commitment"), self.value_commitment)?;

        // Ensure the witnessed asset generator is 32 bytes
        assert_eq!(256, asset_generator_bits.len());

        // Ensure the computed asset generator is 32 bytes
        assert_eq!(256, asset_generator_image.len());

        // Check integrity of the asset generator
        // The following 256 constraints may not be strictly
        // necessary; the output of the BLAKE2s hash may be
        // interpreted directly as a curve point instead
        // However, witnessing the asset generator separately
        // and checking equality to the image of the hash
        // is conceptually clear and not particularly expensive
        for (i, asset_generator_bit, asset_generator_image_bit) in
            multizip((0..256, &asset_generator_bits, &asset_generator_image))
        {
            boolean::Boolean::enforce_equal(
                cs.namespace(|| format!("integrity of asset generator bit {}", i)),
                asset_generator_bit,
                asset_generator_image_bit,
            )?;
        }

        // Place the asset generator in the note commitment
        note_contents.extend(asset_generator_bits);

        // Place the value in the note
        note_contents.extend(value_bits);

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
