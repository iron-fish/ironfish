use bellman::{
    gadgets::{blake2s, boolean},
    Circuit,
};
use ff::PrimeField;
use zcash_primitives::{
    constants::{CRH_IVK_PERSONALIZATION, VALUE_COMMITMENT_GENERATOR_PERSONALIZATION},
    sapling::{PaymentAddress, ProofGenerationKey},
};
use zcash_proofs::{
    circuit::{ecc, pedersen_hash},
    constants::{NOTE_COMMITMENT_RANDOMNESS_GENERATOR, PROOF_GENERATION_KEY_GENERATOR},
};

use crate::circuits::{
    constants::ASSET_IDENTIFIER_PERSONALIZATION,
    util::{hash_asset_to_preimage, slice_into_boolean_vec_le},
};

pub struct CreateAsset {
    /// Name of the asset
    pub name: [u8; 32],

    /// Chain on the network the asset originated from (ex. Ropsten)
    pub chain: [u8; 32],

    /// Network the asset originated from (ex. Ethereum)
    pub network: [u8; 32],

    /// The owner who created the asset. Has permissions to mint
    pub owner: Option<PaymentAddress>,

    /// The random byte used to ensure we get a valid asset identifier
    pub nonce: u8,

    /// Unique byte array which is a hash of all of the identifying fields for
    /// an asset
    pub identifier: [u8; 32],

    pub generator: Option<jubjub::ExtendedPoint>,

    pub create_commitment_randomness: Option<jubjub::Fr>,

    pub proof_generation_key: Option<ProofGenerationKey>,
}

impl Circuit<bls12_381::Scalar> for CreateAsset {
    fn synthesize<CS: bellman::ConstraintSystem<bls12_381::Scalar>>(
        self,
        cs: &mut CS,
    ) -> Result<(), bellman::SynthesisError> {
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
            CRH_IVK_PERSONALIZATION,
        )?;

        // drop_5 to ensure it's in the field
        ivk.truncate(jubjub::Fr::CAPACITY as usize);

        // Witness g_d, checking that it's on the curve.
        let g_d = {
            ecc::EdwardsPoint::witness(
                cs.namespace(|| "witness g_d"),
                self.owner
                    .as_ref()
                    .and_then(|a| a.g_d().map(jubjub::ExtendedPoint::from)),
            )?
        };

        // Check that g_d is not small order.
        g_d.assert_not_small_order(cs.namespace(|| "g_d not small order"))?;

        // Compute pk_d = g_d^ivk
        let pk_d = g_d.mul(cs.namespace(|| "compute pk_d"), &ivk)?;

        // Hash the Asset Info pre-image
        let identifier_preimage = hash_asset_to_preimage(
            &mut cs.namespace(|| "asset info preimage"),
            self.name,
            self.chain,
            self.network,
            // self.owner,
            g_d,
            pk_d,
            self.nonce,
        )?;

        // Computed identifier bits from the given asset info
        let asset_identifier = blake2s::blake2s(
            cs.namespace(|| "blake2s(asset info)"),
            &identifier_preimage,
            ASSET_IDENTIFIER_PERSONALIZATION,
        )?;

        // Ensure the pre-image of the generator is 32 bytes
        assert_eq!(asset_identifier.len(), 256);

        // The asset generator computed in the circuit
        let hashed_asset_generator_bits = blake2s::blake2s(
            cs.namespace(|| "blake2s(asset identifier)"),
            &asset_identifier,
            VALUE_COMMITMENT_GENERATOR_PERSONALIZATION,
        )?;

        // Witnessing this edwards point proves it's a valid point on the curve
        // using the generator point passed in as a circuit parameter
        let provided_asset_generator =
            ecc::EdwardsPoint::witness(cs.namespace(|| "witness asset generator"), self.generator)?;

        // Make the asset generator a public input
        provided_asset_generator.inputize(cs.namespace(|| "inputize asset generator"))?;

        let provided_asset_generator_bits =
            provided_asset_generator.repr(cs.namespace(|| "unpack provided asset generator"))?;

        // TODO: This is copied from sapling output circuit and I'm pretty sure there's
        // a zcash or bellman fn that does this
        // --
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
                &hashed_asset_generator_bits[i],
                &provided_asset_generator_bits[i],
            )?;
        }

        // TODO: Create an Asset Note concept instead of using Asset Info
        // TODO: does this need a different personalization
        let mut commitment = pedersen_hash::pedersen_hash(
            cs.namespace(|| "asset note content hash"),
            pedersen_hash::Personalization::NoteCommitment,
            &asset_identifier,
        )?;

        {
            // Booleanize the randomness
            let randomness_bits = boolean::field_into_boolean_vec_le(
                cs.namespace(|| "rcm"),
                self.create_commitment_randomness,
            )?;

            // Compute the note commitment randomness in the exponent
            let commitment_randomness = ecc::fixed_base_multiplication(
                cs.namespace(|| "computation of commitment randomness"),
                &NOTE_COMMITMENT_RANDOMNESS_GENERATOR,
                &randomness_bits,
            )?;

            // Randomize our note commitment
            commitment = commitment.add(
                cs.namespace(|| "randomization of note commitment"),
                &commitment_randomness,
            )?;
        }

        commitment.get_u().inputize(cs.namespace(|| "commitment"))?;

        // Note to selves: Create Asset circuit is going to be basically identical to Output circuit
        // with proving you own the public key in Asset Info

        Ok(())
    }
}

#[cfg(test)]
mod test {
    use std::slice;

    use bellman::groth16;
    use bls12_381::Bls12;
    use ff::Field;
    use group::{Curve, Group, GroupEncoding};
    use rand::{rngs::OsRng, Rng};
    use zcash_primitives::{
        constants::{
            NOTE_COMMITMENT_RANDOMNESS_GENERATOR, VALUE_COMMITMENT_GENERATOR_PERSONALIZATION,
        },
        sapling::{
            group_hash::group_hash, pedersen_hash, Diversifier, PaymentAddress, ProofGenerationKey,
        },
    };

    use crate::circuits::constants::{ASSET_IDENTIFIER_LENGTH, ASSET_IDENTIFIER_PERSONALIZATION};

    use super::CreateAsset;

    #[test]
    fn test_create_asset_circuit() {
        let params = groth16::generate_random_parameters::<Bls12, _, _>(
            CreateAsset {
                name: [0u8; 32],
                chain: [0u8; 32],
                network: [0u8; 32],
                owner: None,
                nonce: 0,
                identifier: [0u8; 32],
                generator: None,
                create_commitment_randomness: None,
                proof_generation_key: None,
            },
            &mut OsRng,
        )
        .expect("Can generate random params");
        let pvk = groth16::prepare_verifying_key(&params.vk);

        let diversifier = Diversifier([0; 11]);

        println!("1");
        let proof_generation_key = ProofGenerationKey {
            ak: jubjub::SubgroupPoint::random(&mut OsRng),
            nsk: jubjub::Fr::random(&mut OsRng),
        };

        let owner = proof_generation_key
            .to_viewing_key()
            .to_payment_address(diversifier)
            .unwrap();

        let name = [1u8; 32];
        let chain = [2u8; 32];
        let network = [3u8; 32];
        let nonce = 1u8;
        println!("2");

        let mut asset_plaintext: Vec<u8> = vec![];
        asset_plaintext.extend(owner.g_d().unwrap().to_bytes());
        asset_plaintext.extend(owner.pk_d().to_bytes());
        asset_plaintext.extend(name);
        asset_plaintext.extend(chain);
        asset_plaintext.extend(network);
        asset_plaintext.extend(slice::from_ref(&nonce));
        println!("3");

        let identifier = blake2s_simd::Params::new()
            .hash_length(ASSET_IDENTIFIER_LENGTH)
            .personal(ASSET_IDENTIFIER_PERSONALIZATION)
            .to_state()
            .update(&asset_plaintext)
            .finalize();
        println!("4");

        let generator = {
            let g = blake2s_simd::Params::new()
                .personal(VALUE_COMMITMENT_GENERATOR_PERSONALIZATION)
                .hash(identifier.as_bytes());

            jubjub::ExtendedPoint::from_bytes(g.as_array()).unwrap()
        };

        println!("5");
        let create_commitment_randomness = {
            let mut buffer = [0u8; 64];
            OsRng.fill(&mut buffer[..]);

            jubjub::Fr::from_bytes_wide(&buffer)
        };
        println!("6");

        let create_commitment_hash = jubjub::ExtendedPoint::from(pedersen_hash::pedersen_hash(
            pedersen_hash::Personalization::NoteCommitment,
            identifier
                .as_bytes()
                .iter()
                .flat_map(|byte| (0..8).map(move |i| ((byte >> i) & 1) == 1)),
        ));

        println!("7");
        let create_commitment_full_point = create_commitment_hash
            + (NOTE_COMMITMENT_RANDOMNESS_GENERATOR * create_commitment_randomness);

        println!("8");
        let create_commitment = create_commitment_full_point.to_affine().get_u();

        println!("9");
        let public_inputs = [
            generator.to_affine().get_u(),
            generator.to_affine().get_v(),
            create_commitment,
        ];

        println!("10");
        // Create proof
        let circuit = CreateAsset {
            name,
            chain,
            network,
            owner: Some(owner),
            nonce,
            identifier: *identifier.as_array(),
            generator: Some(generator),
            create_commitment_randomness: Some(create_commitment_randomness),
            proof_generation_key: Some(proof_generation_key),
        };
        let proof =
            groth16::create_random_proof(circuit, &params, &mut OsRng).expect("Create valid proof");
        println!("10");

        groth16::verify_proof(&pvk, &proof, &public_inputs).expect("Can verify proof");
    }
}
