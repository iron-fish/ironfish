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

// TODO: Replace hash_into_boolean_vec_le with this fn, length check is probably unnecessary if
// the circuit checks the length
pub fn slice_into_boolean_vec_le<Scalar: PrimeField, CS: ConstraintSystem<Scalar>>(
    mut cs: CS,
    value: Option<&[u8]>,
    length: u32,
) -> Result<Vec<Boolean>, SynthesisError> {
    let values: Vec<Option<bool>> = match value {
        Some(value) => value
            .iter()
            .flat_map(|&v| (0..8).map(move |i| Some((v >> i) & 1 == 1)))
            .collect(),
        None => vec![None; length as usize],
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

/// Exposes a Pedersen commitment to the value as an
/// input to the circuit
pub fn expose_value_commitment<CS>(
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

#[cfg(test)]
mod test {
    use crate::{
        primitives::{asset_type::AssetType, sapling::Note as SaplingNote},
        proofs::circuit::{output::Output, spend::Spend},
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
            let asset_type = AssetType::new(format!("asset {}", i).as_bytes(), &[0; 43])
                .expect("valid asset type");

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
            let asset_type = AssetType::new(format!("asset {}", i).as_bytes(), &[0; 43])
                .expect("valid asset type");
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
