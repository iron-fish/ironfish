use std::io::{Read, Write};

use byteorder::{LittleEndian, ReadBytesExt, WriteBytesExt};
use ff::{Field, PrimeField};
use group::GroupEncoding;
use ironfish_bellperson::{Circuit, ConstraintSystem, SynthesisError};
use ironfish_jubjub::SubgroupPoint;

use crate::constants::{CRH_IVK_PERSONALIZATION, PRF_NF_PERSONALIZATION};
use crate::ProofGenerationKey;
use crate::{constants::proof::PUBLIC_KEY_GENERATOR, primitives::ValueCommitment};

use super::util::{expose_value_commitment, FromBytes};
use ironfish_bellperson::gadgets::blake2s;
use ironfish_bellperson::gadgets::boolean;
use ironfish_bellperson::gadgets::multipack;
use ironfish_bellperson::gadgets::num;
use ironfish_bellperson::gadgets::Assignment;
use ironfish_proofs::{
    circuit::{ecc, pedersen_hash},
    constants::{
        NOTE_COMMITMENT_RANDOMNESS_GENERATOR, NULLIFIER_POSITION_GENERATOR,
        PROOF_GENERATION_KEY_GENERATOR, SPENDING_KEY_GENERATOR,
    },
};

/// This is a circuit instance inspired from ZCash's `Spend` circuit in the Sapling protocol
/// https://github.com/zcash/librustzcash/blob/main/zcash_proofs/src/circuit/sapling.rs#L31-L55
#[derive(Clone, Debug)]
pub struct Spend {
    /// Pedersen commitment to the value being spent
    pub value_commitment: Option<ValueCommitment>,

    /// Key required to construct proofs for spending notes
    /// for a particular spending key
    pub proof_generation_key: Option<ProofGenerationKey>,

    /// The payment address associated with the note
    pub payment_address: Option<SubgroupPoint>,

    /// The randomness of the note commitment
    pub commitment_randomness: Option<ironfish_jubjub::Fr>,

    /// Re-randomization of the public key
    pub ar: Option<ironfish_jubjub::Fr>,

    /// The authentication path of the commitment in the tree
    pub auth_path: Vec<Option<(blstrs::Scalar, bool)>>,

    /// The anchor; the root of the tree. If the note being
    /// spent is zero-value, this can be anything.
    pub anchor: Option<blstrs::Scalar>,

    /// The sender address associated with the note
    pub sender_address: Option<SubgroupPoint>,
}

impl Spend {
    pub fn write<W: Write>(&self, mut writer: W) -> std::io::Result<()> {
        if let Some(ref value_commitment) = self.value_commitment {
            writer.write_u8(1)?;
            writer.write_all(&value_commitment.to_bytes())?;
        } else {
            writer.write_u8(0)?;
        }
        if let Some(ref proof_generation_key) = self.proof_generation_key {
            writer.write_u8(1)?;
            writer.write_all(proof_generation_key.to_bytes().as_ref())?;
        } else {
            writer.write_u8(0)?;
        }
        if let Some(ref payment_address) = self.payment_address {
            writer.write_u8(1)?;
            writer.write_all(payment_address.to_bytes().as_ref())?;
        } else {
            writer.write_u8(0)?;
        }
        if let Some(ref commitment_randomness) = self.commitment_randomness {
            writer.write_u8(1)?;
            writer.write_all(commitment_randomness.to_bytes().as_ref())?;
        } else {
            writer.write_u8(0)?;
        }
        if let Some(ref ar) = self.ar {
            writer.write_u8(1)?;
            writer.write_all(ar.to_bytes().as_ref())?;
        } else {
            writer.write_u8(0)?;
        }
        writer.write_all((self.auth_path.len() as u64).to_le_bytes().as_ref())?;
        for auth_path in &self.auth_path {
            match auth_path {
                Some((val, flag)) => {
                    writer.write_u8(1)?;
                    writer.write_all(&val.to_bytes_le())?;
                    writer.write_u8(*flag as u8)?;
                }
                None => writer.write_u8(0)?,
            }
        }
        if let Some(anchor) = &self.anchor {
            writer.write_u8(1)?;
            writer.write_all(anchor.to_bytes_le().as_ref())?;
        } else {
            writer.write_u8(0)?;
        }
        if let Some(ref sender_address) = self.sender_address {
            writer.write_u8(1)?;
            writer.write_all(sender_address.to_bytes().as_ref())?;
        } else {
            writer.write_u8(0)?;
        }
        Ok(())
    }

    pub fn read<R: Read>(mut reader: R) -> std::io::Result<Spend> {
        let mut value_commitment = None;
        if reader.read_u8()? == 1 {
            value_commitment = Some(ValueCommitment::read(&mut reader)?);
        }
        let mut proof_generation_key = None;
        if reader.read_u8()? == 1 {
            proof_generation_key = Some(ProofGenerationKey::read(&mut reader)?);
        }
        let mut payment_address = None;
        if reader.read_u8()? == 1 {
            payment_address = Some(SubgroupPoint::read(&mut reader)?);
        }
        let mut commitment_randomness = None;
        if reader.read_u8()? == 1 {
            commitment_randomness = Some(ironfish_jubjub::Fr::read(&mut reader)?);
        }
        let mut ar = None;
        if reader.read_u8()? == 1 {
            ar = Some(ironfish_jubjub::Fr::read(&mut reader)?);
        }
        let len = reader.read_u64::<LittleEndian>().unwrap();
        let mut auth_path = vec![];
        for _ in 0..len {
            if reader.read_u8()? == 1 {
                let val = blstrs::Scalar::read(&mut reader)?;
                let flag = reader.read_u8()? == 1;
                auth_path.push(Some((val, flag)));
            } else {
                auth_path.push(None);
            }
        }
        let mut anchor = None;
        if reader.read_u8()? == 1 {
            anchor = Some(blstrs::Scalar::read(&mut reader)?);
        }
        let mut sender_address = None;
        if reader.read_u8()? == 1 {
            sender_address = Some(SubgroupPoint::read(&mut reader)?);
        }
        Ok(Spend {
            value_commitment,
            proof_generation_key,
            payment_address,
            commitment_randomness,
            ar,
            auth_path,
            anchor,
            sender_address,
        })
    }
}

impl Circuit<blstrs::Scalar> for Spend {
    fn synthesize<CS: ConstraintSystem<blstrs::Scalar>>(
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
            CRH_IVK_PERSONALIZATION,
        )?;

        // drop_5 to ensure it's in the field
        ivk.truncate(ironfish_jubjub::Fr::CAPACITY as usize);

        // Compute pk_d
        let pk_d = ecc::fixed_base_multiplication(
            cs.namespace(|| "compute pk_d"),
            &PUBLIC_KEY_GENERATOR,
            &ivk,
        )?;

        // Compute note contents:
        // asset generator, value (in big endian), followed by pk_d
        let mut note_contents = vec![];

        let asset_generator = ecc::EdwardsPoint::witness(
            cs.namespace(|| "asset_generator"),
            self.value_commitment.as_ref().map(|vc| vc.asset_generator),
        )?;

        note_contents
            .extend(asset_generator.repr(cs.namespace(|| "representation of asset_generator"))?);

        // Handle the value; we'll need it later for the
        // dummy input check.
        let mut value_num = num::Num::zero();
        {
            // Get the value in little-endian bit order
            let value_bits = expose_value_commitment(
                cs.namespace(|| "value commitment"),
                asset_generator,
                self.value_commitment,
            )?;

            // Compute the note's value as a linear combination
            // of the bits.
            let mut coeff = blstrs::Scalar::one();
            for bit in &value_bits {
                value_num = value_num.add_bool_with_coeff(CS::one(), bit, coeff);
                coeff = coeff.double();
            }

            // Place the value in the note
            note_contents.extend(value_bits);
        }

        // Place pk_d in the note
        note_contents.extend(pk_d.repr(cs.namespace(|| "representation of pk_d"))?);

        // add sender address to note contents so correct note commitment can be calculated
        let sender_address = ecc::EdwardsPoint::witness(
            cs.namespace(|| "sender_address"),
            self.sender_address
                .map(ironfish_jubjub::ExtendedPoint::from),
        )?;

        // Place sender_address (pk_d) in the note
        note_contents.extend(
            sender_address.repr(cs.namespace(|| "representation of sender_address (pk_d)"))?,
        );

        assert_eq!(
            note_contents.len(),
            256 + // asset generator
            64 + // value
            256 + // pk_d owner
            256 // pk_d sender (this is added to match requirements for `Output` circuit)
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
                |lc| lc + &value_num.lc(blstrs::Scalar::one()),
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
            PRF_NF_PERSONALIZATION,
        )?;

        multipack::pack_into_inputs(cs.namespace(|| "pack nullifier"), &nf)
    }
}

#[cfg(test)]
mod test {
    use blake2s_simd::Params as Blake2sParams;
    use ff::{Field, PrimeField, PrimeFieldBits};
    use group::{Curve, Group, GroupEncoding};
    use ironfish_bellperson::{
        gadgets::{multipack, test::*},
        Circuit, ConstraintSystem,
    };
    use ironfish_primitives::sapling::{pedersen_hash, Note, Rseed};
    use ironfish_primitives::{constants::NULLIFIER_POSITION_GENERATOR, sapling::Nullifier};
    use rand::{rngs::StdRng, RngCore, SeedableRng};

    use crate::{
        circuits::spend::Spend,
        constants::{
            PRF_NF_PERSONALIZATION, PUBLIC_KEY_GENERATOR, VALUE_COMMITMENT_VALUE_GENERATOR,
        },
        primitives::ValueCommitment,
        util::commitment_full_point,
        ProofGenerationKey,
    };

    #[test]
    fn test_spend_circuit_with_blstrs() {
        // Seed a fixed rng for determinism in the test
        let mut rng = StdRng::seed_from_u64(0);

        let tree_depth = 32;

        for _ in 0..5 {
            let value_commitment = ValueCommitment {
                value: rng.next_u64(),
                randomness: ironfish_jubjub::Fr::random(&mut rng),
                asset_generator: (*VALUE_COMMITMENT_VALUE_GENERATOR).into(),
            };

            let proof_generation_key = ProofGenerationKey::new(
                ironfish_jubjub::SubgroupPoint::random(&mut rng),
                ironfish_jubjub::Fr::random(&mut rng),
            );

            let viewing_key = proof_generation_key.to_viewing_key();

            let payment_address = *PUBLIC_KEY_GENERATOR * viewing_key.ivk().0;

            let commitment_randomness = ironfish_jubjub::Fr::random(&mut rng);
            let auth_path =
                vec![Some((blstrs::Scalar::random(&mut rng), rng.next_u32() % 2 != 0)); tree_depth];
            let ar = ironfish_jubjub::Fr::random(&mut rng);

            {
                let rk = ironfish_jubjub::ExtendedPoint::from(viewing_key.rk(ar)).to_affine();
                let expected_value_commitment =
                    ironfish_jubjub::ExtendedPoint::from(value_commitment.commitment()).to_affine();
                let note = Note {
                    value: value_commitment.value,
                    g_d: *PUBLIC_KEY_GENERATOR,
                    pk_d: payment_address,
                    rseed: Rseed::BeforeZip212(commitment_randomness),
                };

                let mut position = 0u64;
                let commitment = commitment_full_point(
                    value_commitment.asset_generator,
                    value_commitment.value,
                    payment_address,
                    note.rcm(),
                    payment_address,
                );
                let cmu = ironfish_jubjub::ExtendedPoint::from(commitment)
                    .to_affine()
                    .get_u();

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

                    cur = ironfish_jubjub::ExtendedPoint::from(pedersen_hash::pedersen_hash(
                        pedersen_hash::Personalization::MerkleTree(i),
                        lhs.iter()
                            .by_vals()
                            .take(blstrs::Scalar::NUM_BITS as usize)
                            .chain(rhs.iter().by_vals().take(blstrs::Scalar::NUM_BITS as usize)),
                    ))
                    .to_affine()
                    .get_u();

                    if b {
                        position |= 1 << i;
                    }
                }

                let rho = commitment
                    + (*NULLIFIER_POSITION_GENERATOR * ironfish_jubjub::Fr::from(position));

                // Compute nf = BLAKE2s(nk | rho)
                let expected_nf = Nullifier::from_slice(
                    Blake2sParams::new()
                        .hash_length(32)
                        .personal(PRF_NF_PERSONALIZATION)
                        .to_state()
                        .update(&viewing_key.nk.to_bytes())
                        .update(&rho.to_bytes())
                        .finalize()
                        .as_bytes(),
                )
                .unwrap();

                let expected_nf = multipack::bytes_to_bits_le(&expected_nf.0);
                let expected_nf = multipack::compute_multipacking(&expected_nf);
                assert_eq!(expected_nf.len(), 2);

                let mut cs = TestConstraintSystem::new();

                let instance = Spend {
                    value_commitment: Some(value_commitment.clone()),
                    proof_generation_key: Some(proof_generation_key.clone()),
                    payment_address: Some(payment_address),
                    commitment_randomness: Some(commitment_randomness),
                    ar: Some(ar),
                    auth_path: auth_path.clone(),
                    anchor: Some(cur),
                    sender_address: Some(payment_address),
                };

                instance.synthesize(&mut cs).unwrap();

                assert!(cs.is_satisfied());
                assert_eq!(cs.num_constraints(), 98118);
                assert_eq!(
                    cs.hash(),
                    "3beab29b9ac7e33812cbe357ffc05997c891947395468720485b335050cac706"
                );

                assert_eq!(cs.get("randomization of note commitment/u3/num"), cmu);

                assert_eq!(cs.num_inputs(), 8);
                assert_eq!(cs.get_input(0, "ONE"), blstrs::Scalar::one());
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
    fn test_spend_circuit_with_blstrs_external_test_vectors() {
        // Seed a fixed rng for determinism in the test
        let mut rng = StdRng::seed_from_u64(0);

        let tree_depth = 32;

        let expected_commitment_us = [
            "43821661663052659750276289184181083197337192946256245809816728673021647664276",
            "3307162152126086816128645612622677680790809218093944138874328908293932504970",
            "11069610839860164669107523771435662310747439806735198902948128278779049984187",
            "41940920445724888473708658693943093655174812428044709757836212456454182108570",
            "21486204115269202361511785053830008932611482941164104173096094940232117952518",
        ];

        let expected_commitment_vs = [
            "27630722367128086497290371604583225252915685718989450292520883698391703910",
            "50661753032157861157033186529508424590095922868336394465083465551064239171765",
            "42720677731824278375166374390978871535259136440715287500660141460976255671332",
            "18456118192639989807838718817278641179256698005479865456409562916641766503518",
            "26516469925064052571100169784408555020094525182981184778759869098319435854053",
        ];

        for i in 0..5 {
            let value_commitment = ValueCommitment {
                value: i,
                randomness: ironfish_jubjub::Fr::from(1000 * (i + 1)),
                asset_generator: (*VALUE_COMMITMENT_VALUE_GENERATOR).into(),
            };

            let proof_generation_key = ProofGenerationKey::new(
                ironfish_jubjub::SubgroupPoint::random(&mut rng),
                ironfish_jubjub::Fr::random(&mut rng),
            );

            let viewing_key = proof_generation_key.to_viewing_key();

            let payment_address = *PUBLIC_KEY_GENERATOR * viewing_key.ivk().0;

            let commitment_randomness = ironfish_jubjub::Fr::random(&mut rng);
            let auth_path =
                vec![Some((blstrs::Scalar::random(&mut rng), rng.next_u32() % 2 != 0)); tree_depth];
            let ar = ironfish_jubjub::Fr::random(&mut rng);

            {
                let rk = ironfish_jubjub::ExtendedPoint::from(viewing_key.rk(ar)).to_affine();
                let expected_value_commitment =
                    ironfish_jubjub::ExtendedPoint::from(value_commitment.commitment()).to_affine();
                assert_eq!(
                    expected_value_commitment.get_u(),
                    blstrs::Scalar::from_str_vartime(expected_commitment_us[i as usize]).unwrap()
                );
                assert_eq!(
                    expected_value_commitment.get_v(),
                    blstrs::Scalar::from_str_vartime(expected_commitment_vs[i as usize]).unwrap()
                );

                let mut position = 0u64;

                let commitment = commitment_full_point(
                    value_commitment.asset_generator,
                    value_commitment.value,
                    payment_address,
                    commitment_randomness,
                    payment_address,
                );
                let cmu = ironfish_jubjub::ExtendedPoint::from(commitment)
                    .to_affine()
                    .get_u();

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

                    cur = ironfish_jubjub::ExtendedPoint::from(pedersen_hash::pedersen_hash(
                        pedersen_hash::Personalization::MerkleTree(i),
                        lhs.iter()
                            .by_vals()
                            .take(blstrs::Scalar::NUM_BITS as usize)
                            .chain(rhs.iter().by_vals().take(blstrs::Scalar::NUM_BITS as usize)),
                    ))
                    .to_affine()
                    .get_u();

                    if b {
                        position |= 1 << i;
                    }
                }

                let rho = commitment
                    + (*NULLIFIER_POSITION_GENERATOR * ironfish_jubjub::Fr::from(position));

                // Compute nf = BLAKE2s(nk | rho)
                let expected_nf = Nullifier::from_slice(
                    Blake2sParams::new()
                        .hash_length(32)
                        .personal(PRF_NF_PERSONALIZATION)
                        .to_state()
                        .update(&viewing_key.nk.to_bytes())
                        .update(&rho.to_bytes())
                        .finalize()
                        .as_bytes(),
                )
                .unwrap();

                let expected_nf = multipack::bytes_to_bits_le(&expected_nf.0);
                let expected_nf = multipack::compute_multipacking(&expected_nf);
                assert_eq!(expected_nf.len(), 2);

                let mut cs = TestConstraintSystem::new();

                let instance = Spend {
                    value_commitment: Some(value_commitment.clone()),
                    proof_generation_key: Some(proof_generation_key.clone()),
                    payment_address: Some(payment_address),
                    commitment_randomness: Some(commitment_randomness),
                    ar: Some(ar),
                    auth_path: auth_path.clone(),
                    anchor: Some(cur),
                    sender_address: Some(payment_address),
                };

                instance.synthesize(&mut cs).unwrap();

                assert!(cs.is_satisfied());
                assert_eq!(cs.num_constraints(), 98118);
                assert_eq!(
                    cs.hash(),
                    "3beab29b9ac7e33812cbe357ffc05997c891947395468720485b335050cac706"
                );

                assert_eq!(cs.get("randomization of note commitment/u3/num"), cmu);

                assert_eq!(cs.num_inputs(), 8);
                assert_eq!(cs.get_input(0, "ONE"), blstrs::Scalar::one());
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
    fn test_spend_read_write() {
        let mut rng = StdRng::seed_from_u64(0);

        let value_commitment = ValueCommitment {
            value: rng.next_u64(),
            randomness: ironfish_jubjub::Fr::random(&mut rng),
            asset_generator: (*VALUE_COMMITMENT_VALUE_GENERATOR).into(),
        };

        let proof_generation_key = ProofGenerationKey::new(
            ironfish_jubjub::SubgroupPoint::random(&mut rng),
            ironfish_jubjub::Fr::random(&mut rng),
        );

        let viewing_key = proof_generation_key.to_viewing_key();

        let payment_address = *PUBLIC_KEY_GENERATOR * viewing_key.ivk().0;

        let commitment_randomness = ironfish_jubjub::Fr::random(&mut rng);
        let auth_path = vec![Some((blstrs::Scalar::random(&mut rng), rng.next_u32() % 2 != 0)); 32];
        let ar = ironfish_jubjub::Fr::random(&mut rng);

        let sender_address = ironfish_jubjub::SubgroupPoint::random(&mut rng);

        let anchor = blstrs::Scalar::random(&mut rng);

        let spend = Spend {
            value_commitment: Some(value_commitment.clone()),
            proof_generation_key: Some(proof_generation_key.clone()),
            payment_address: Some(payment_address),
            commitment_randomness: Some(commitment_randomness),
            ar: Some(ar),
            auth_path: auth_path.clone(),
            anchor: Some(anchor),
            sender_address: Some(sender_address),
        };

        let mut buffer = vec![];
        spend.write(&mut buffer).unwrap();

        let deserialized_spend = Spend::read(&buffer[..]).unwrap();
        assert_eq!(
            spend.value_commitment.clone().unwrap().value,
            deserialized_spend.value_commitment.clone().unwrap().value
        );
        assert_eq!(
            spend.value_commitment.clone().unwrap().randomness,
            deserialized_spend
                .value_commitment
                .clone()
                .unwrap()
                .randomness
        );
        assert_eq!(
            spend
                .value_commitment
                .clone()
                .unwrap()
                .asset_generator
                .to_bytes(),
            deserialized_spend
                .value_commitment
                .clone()
                .unwrap()
                .asset_generator
                .to_bytes()
        );

        assert_eq!(
            spend.proof_generation_key.clone().unwrap().ak.to_bytes(),
            deserialized_spend
                .proof_generation_key
                .clone()
                .unwrap()
                .ak
                .to_bytes()
        );
        assert_eq!(
            spend.proof_generation_key.clone().unwrap().nsk,
            deserialized_spend.proof_generation_key.clone().unwrap().nsk
        );

        assert_eq!(
            spend.payment_address.unwrap().to_bytes(),
            deserialized_spend.payment_address.unwrap().to_bytes()
        );

        assert_eq!(
            spend.commitment_randomness,
            deserialized_spend.commitment_randomness
        );

        assert_eq!(spend.ar, deserialized_spend.ar);

        assert_eq!(spend.auth_path.len(), deserialized_spend.auth_path.len());
        for (ap1, ap2) in spend
            .auth_path
            .iter()
            .zip(deserialized_spend.auth_path.iter())
        {
            assert_eq!((*ap1).unwrap().0, (*ap2).unwrap().0);
            assert_eq!((*ap1).unwrap().1, (*ap2).unwrap().1);
        }

        assert_eq!(spend.anchor, deserialized_spend.anchor);

        assert_eq!(
            spend.sender_address.unwrap().to_bytes(),
            deserialized_spend.sender_address.unwrap().to_bytes()
        );
    }
}
