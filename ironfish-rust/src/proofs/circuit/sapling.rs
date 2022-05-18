// Credit to https://github.com/zcash/librustzcash for providing the initial implementation of this file
// Credit to https://github.com/anoma/masp for providing the initial implementation of adding asset awareness to this file

//! The Sapling circuits.

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

pub const TREE_DEPTH: usize = zcash_primitives::sapling::SAPLING_COMMITMENT_TREE_DEPTH;

/// This is an instance of the `Spend` circuit.
pub struct Spend {
    // TODO: Should we pass this in anymore, or just rely on asset type? Feels like this could lead to accidental bugs.
    /// Pedersen commitment to the value being spent
    pub value_commitment: Option<ValueCommitment>,

    /// Asset type that the value is denominated in
    pub asset_type: Option<AssetType>,

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

// TODO: This is a minorly tweaked version of bellman::gadgets::boolean::u64_into_boolean_vec_le, this needs a better home
pub fn hash_into_boolean_vec_le<Scalar: PrimeField, CS: ConstraintSystem<Scalar>>(
    mut cs: CS,
    value: Option<&[u8; 32]>,
) -> Result<Vec<Boolean>, SynthesisError> {
    let values = match value {
        Some(value) => value
            .iter()
            .flat_map(|&v| (0..8).map(move |i| Some((v >> i) & 1 == 1)))
            .collect(),
        None => vec![None; 256],
    };

    let bits = values
        .into_iter()
        .enumerate()
        .map(|(i, b)| {
            Ok(Boolean::from(AllocatedBit::alloc(
                cs.namespace(|| format!("bit {}", i)),
                b,
            )?))
        })
        .collect::<Result<Vec<_>, SynthesisError>>()?;

    Ok(bits)
}

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

/// Exposes a Pedersen commitment to the value as an
/// input to the circuit
fn expose_value_commitment<CS>(
    mut cs: CS,
    value_commitment_generator: EdwardsPoint,
    value_commitment: Option<ValueCommitment>,
) -> Result<Vec<boolean::Boolean>, SynthesisError>
where
    CS: ConstraintSystem<bls12_381::Scalar>,
{
    // Booleanize the value into little-endian bit order
    let value_bits = boolean::u64_into_boolean_vec_le(
        cs.namespace(|| "value"),
        value_commitment.as_ref().map(|c| c.value),
    )?;

    // Compute the note value in the exponent
    let value = value_commitment_generator.mul(
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

    Ok(value_bits)
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

        value_commitment_generator.assert_not_small_order(
            cs.namespace(|| "value_commitment_generator not small order"),
        )?;

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

#[cfg(test)]
mod test {
    use crate::{
        primitives::{asset_type::AssetType, sapling::Note as SaplingNote},
        proofs::circuit::sapling::{Output, Spend},
    };
    use bellman::{
        gadgets::{multipack, test::*},
        Circuit,
    };
    use ff::{Field, PrimeField};
    use group::{Curve, Group};
    use rand::{prelude::StdRng, Rng, RngCore, SeedableRng};
    use zcash_primitives::{
        pedersen_hash,
        primitives::{Diversifier, ProofGenerationKey, Rseed},
    };

    #[test]
    fn test_input_circuit_with_bls12_381() {
        let mut rng = StdRng::seed_from_u64(1);

        let tree_depth = 32;

        let asset_type = AssetType::default();

        for _ in 0..10 {
            let mut buffer = [0u8; 64];
            rng.fill(&mut buffer[..]);

            let value_commitment_randomness: jubjub::Fr = jubjub::Fr::from_bytes_wide(&buffer);
            let value_commitment =
                asset_type.value_commitment(rng.next_u64(), value_commitment_randomness);

            let proof_generation_key = ProofGenerationKey {
                ak: jubjub::SubgroupPoint::random(&mut rng),
                nsk: jubjub::Fr::random(&mut rng),
            };

            let viewing_key = proof_generation_key.to_viewing_key();

            let payment_address;

            loop {
                let diversifier = {
                    let mut d = [0; 11];
                    rng.fill_bytes(&mut d);
                    Diversifier(d)
                };

                if let Some(p) = viewing_key.to_payment_address(diversifier) {
                    payment_address = p;
                    break;
                }
            }

            let g_d = payment_address.diversifier().g_d().unwrap();
            let commitment_randomness = jubjub::Fr::random(&mut rng);
            let auth_path =
                vec![
                    Some((bls12_381::Scalar::random(&mut rng), rng.next_u32() % 2 != 0));
                    tree_depth
                ];
            let ar = jubjub::Fr::random(&mut rng);

            {
                let rk = jubjub::ExtendedPoint::from(viewing_key.rk(ar)).to_affine();
                let expected_value_commitment =
                    jubjub::ExtendedPoint::from(value_commitment.commitment()).to_affine();
                let note = SaplingNote {
                    value: value_commitment.value,
                    asset_type,
                    g_d,
                    pk_d: *payment_address.pk_d(),
                    rseed: Rseed::BeforeZip212(commitment_randomness),
                };

                let mut position = 0u64;
                let cmu = note.cmu();
                let mut cur = cmu;

                for (i, val) in auth_path.clone().into_iter().enumerate() {
                    let (uncle, b) = val.unwrap();

                    let mut lhs = cur;
                    let mut rhs = uncle;

                    if b {
                        ::std::mem::swap(&mut lhs, &mut rhs);
                    }

                    let lhs = lhs.to_le_bits();
                    let rhs = rhs.to_le_bits();

                    cur = jubjub::ExtendedPoint::from(pedersen_hash::pedersen_hash(
                        pedersen_hash::Personalization::MerkleTree(i),
                        lhs.into_iter()
                            .take(bls12_381::Scalar::NUM_BITS as usize)
                            .chain(rhs.into_iter().take(bls12_381::Scalar::NUM_BITS as usize))
                            .cloned(),
                    ))
                    .to_affine()
                    .get_u();

                    if b {
                        position |= 1 << i;
                    }
                }

                let expected_nf = note.nf(&viewing_key, position);
                let expected_nf = multipack::bytes_to_bits_le(&expected_nf.0);
                let expected_nf = multipack::compute_multipacking(&expected_nf);
                assert_eq!(expected_nf.len(), 2);

                let mut cs = TestConstraintSystem::new();

                let instance = Spend {
                    value_commitment: Some(value_commitment.clone()),
                    asset_type: Some(asset_type),
                    proof_generation_key: Some(proof_generation_key.clone()),
                    payment_address: Some(payment_address.clone()),
                    commitment_randomness: Some(commitment_randomness),
                    ar: Some(ar),
                    auth_path: auth_path.clone(),
                    anchor: Some(cur),
                };

                instance.synthesize(&mut cs).unwrap();

                assert!(cs.is_satisfied());
                assert_eq!(cs.num_constraints(), 100641);
                assert_eq!(
                    cs.hash(),
                    "a8838016e138f9bedb30457ad3a0beede08786c7e3c900400c1fcde044170cab"
                );

                assert_eq!(cs.get("randomization of note commitment/u3/num"), cmu);

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
                assert_eq!(cs.get_input(5, "anchor/input variable"), cur);
                assert_eq!(cs.get_input(6, "pack nullifier/input 0"), expected_nf[0]);
                assert_eq!(cs.get_input(7, "pack nullifier/input 1"), expected_nf[1]);
            }
        }
    }

    #[test]
    fn test_input_circuit_with_bls12_381_external_test_vectors() {
        let mut rng = StdRng::seed_from_u64(1);

        let tree_depth = 32;

        let expected_commitment_us = vec![
            "43821661663052659750276289184181083197337192946256245809816728673021647664276",
            "17292419842339652830914786027018166937662714176274310670582220439706459355590",
            "10846512181884053501196775315558734040270539656997399924861733052609735283442",
            "29917231201525828827053805793413526883580116866478193671866366635407981516418",
            "6488572120595149853848724212295588732037461656934902762023969343044165598118",
            "36458911336026265903838662829025519465694929195774897260374830584263146683889",
            "18126604547606707005912850606746462377524009143341469583088170651601703678577",
            "49879531033159920597927430572694911953659205308861368945158545996133186656311",
            "9086249749874501961786572284706642057551916973296720290892336505607683000529",
            "31851149033117540442176273711458475343449309699781961289682752316941254154835",
        ];

        let expected_commitment_vs = vec![
            "27630722367128086497290371604583225252915685718989450292520883698391703910",
            "33912937530871751599296634206187515682392296826579034407842658784516758591336",
            "19308107426200236957751335041585363642140564340282400798115556419867269267605",
            "3040832613994822905056296862498417146187740745522601303012443981540576659953",
            "35962432312573756481982573383241786335981337905464043425833586152852732333312",
            "5379587067238499910337873241549804817668365044863304903528341402525486090104",
            "43388053530555142879086807971880840002007675942542239825901350338141875770149",
            "18898960943707761912756768775511720461479470006580463145808616454775301881959",
            "30273759374595916753520979150643178108919710814597292626418311829241260874996",
            "2798834612600987747420552426781577009460173304191646644854245203567377960289",
        ];

        for i in 0..10 {
            let asset_type =
                AssetType::new(format!("asset {}", i).as_bytes()).expect("valid asset type");

            let value_commitment = asset_type.value_commitment(
                i,
                jubjub::Fr::from_str(&(1000 * (i + 1)).to_string()).unwrap(),
            );

            let proof_generation_key = ProofGenerationKey {
                ak: jubjub::SubgroupPoint::random(&mut rng),
                nsk: jubjub::Fr::random(&mut rng),
            };

            let viewing_key = proof_generation_key.to_viewing_key();

            let payment_address;

            loop {
                let diversifier = {
                    let mut d = [0; 11];
                    rng.fill_bytes(&mut d);
                    Diversifier(d)
                };

                if let Some(p) = viewing_key.to_payment_address(diversifier) {
                    payment_address = p;
                    break;
                }
            }

            let g_d = payment_address.diversifier().g_d().unwrap();
            let commitment_randomness = jubjub::Fr::random(&mut rng);
            let auth_path =
                vec![
                    Some((bls12_381::Scalar::random(&mut rng), rng.next_u32() % 2 != 0));
                    tree_depth
                ];
            let ar = jubjub::Fr::random(&mut rng);

            {
                let rk = jubjub::ExtendedPoint::from(viewing_key.rk(ar)).to_affine();
                let expected_value_commitment =
                    jubjub::ExtendedPoint::from(value_commitment.commitment()).to_affine();
                assert_eq!(
                    expected_value_commitment.get_u(),
                    bls12_381::Scalar::from_str(expected_commitment_us[i as usize]).unwrap()
                );
                assert_eq!(
                    expected_value_commitment.get_v(),
                    bls12_381::Scalar::from_str(expected_commitment_vs[i as usize]).unwrap()
                );
                let note = SaplingNote {
                    value: value_commitment.value,
                    asset_type,
                    g_d,
                    pk_d: *payment_address.pk_d(),
                    rseed: Rseed::BeforeZip212(commitment_randomness),
                };

                let mut position = 0u64;
                let cmu = note.cmu();
                let mut cur = cmu;

                for (i, val) in auth_path.clone().into_iter().enumerate() {
                    let (uncle, b) = val.unwrap();

                    let mut lhs = cur;
                    let mut rhs = uncle;

                    if b {
                        ::std::mem::swap(&mut lhs, &mut rhs);
                    }

                    let lhs = lhs.to_le_bits();
                    let rhs = rhs.to_le_bits();

                    cur = jubjub::ExtendedPoint::from(pedersen_hash::pedersen_hash(
                        pedersen_hash::Personalization::MerkleTree(i),
                        lhs.into_iter()
                            .take(bls12_381::Scalar::NUM_BITS as usize)
                            .chain(rhs.into_iter().take(bls12_381::Scalar::NUM_BITS as usize))
                            .cloned(),
                    ))
                    .to_affine()
                    .get_u();

                    if b {
                        position |= 1 << i;
                    }
                }

                let expected_nf = note.nf(&viewing_key, position);
                let expected_nf = multipack::bytes_to_bits_le(&expected_nf.0);
                let expected_nf = multipack::compute_multipacking(&expected_nf);
                assert_eq!(expected_nf.len(), 2);

                let mut cs = TestConstraintSystem::new();

                let instance = Spend {
                    value_commitment: Some(value_commitment.clone()),
                    asset_type: Some(asset_type),
                    proof_generation_key: Some(proof_generation_key.clone()),
                    payment_address: Some(payment_address.clone()),
                    commitment_randomness: Some(commitment_randomness),
                    ar: Some(ar),
                    auth_path: auth_path.clone(),
                    anchor: Some(cur),
                };

                instance.synthesize(&mut cs).unwrap();

                assert!(cs.is_satisfied());
                assert_eq!(cs.num_constraints(), 100641);
                assert_eq!(
                    cs.hash(),
                    "a8838016e138f9bedb30457ad3a0beede08786c7e3c900400c1fcde044170cab"
                );

                assert_eq!(cs.get("randomization of note commitment/u3/num"), cmu);

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
                assert_eq!(cs.get_input(5, "anchor/input variable"), cur);
                assert_eq!(cs.get_input(6, "pack nullifier/input 0"), expected_nf[0]);
                assert_eq!(cs.get_input(7, "pack nullifier/input 1"), expected_nf[1]);
            }
        }
    }

    #[test]
    fn test_output_circuit_with_bls12_381() {
        let mut rng = StdRng::seed_from_u64(1);

        for i in 0..100 {
            let asset_type =
                AssetType::new(format!("asset {}", i).as_bytes()).expect("valid asset type");
            // TODO: Change more from_bytes_wide to random
            let value_commitment =
                asset_type.value_commitment(rng.next_u64(), jubjub::Fr::random(&mut rng));

            let nsk = jubjub::Fr::random(&mut rng);
            let ak = jubjub::SubgroupPoint::random(&mut rng);

            let proof_generation_key = ProofGenerationKey { ak, nsk };

            let viewing_key = proof_generation_key.to_viewing_key();

            let payment_address;

            loop {
                let diversifier = {
                    let mut d = [0; 11];
                    rng.fill_bytes(&mut d);
                    Diversifier(d)
                };

                if let Some(p) = viewing_key.to_payment_address(diversifier) {
                    payment_address = p;
                    break;
                }
            }

            let commitment_randomness = jubjub::Fr::random(&mut rng);
            let esk = jubjub::Fr::random(&mut rng);

            {
                let mut cs = TestConstraintSystem::new();

                let instance = Output {
                    value_commitment: Some(value_commitment.clone()),
                    asset_type: Some(asset_type),
                    payment_address: Some(payment_address.clone()),
                    commitment_randomness: Some(commitment_randomness),
                    esk: Some(esk),
                };

                instance.synthesize(&mut cs).unwrap();

                assert!(cs.is_satisfied());
                assert_eq!(cs.num_constraints(), 31209);
                assert_eq!(
                    cs.hash(),
                    "846bb89d1d6072423e869c89d6234d61404d8ef3edc12ba8482f061d20dac456"
                );

                // TODO: We probably want to bring in PaymentAddress to make sure PaymentAddress::create_note() doesnt become a footgun
                let expected_cmu = (SaplingNote {
                    value: value_commitment.value,
                    asset_type,
                    g_d: payment_address.diversifier().g_d().unwrap(),
                    pk_d: *payment_address.pk_d(),
                    rseed: Rseed::BeforeZip212(commitment_randomness),
                })
                .cmu();

                let expected_value_commitment =
                    jubjub::ExtendedPoint::from(value_commitment.commitment()).to_affine();

                let expected_epk = jubjub::ExtendedPoint::from(
                    payment_address.g_d().expect("should be valid") * esk,
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
