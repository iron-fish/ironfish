use bellman::{
    gadgets::{blake2s, boolean, multipack},
    Circuit,
};
use ff::PrimeField;
use zcash_primitives::{
    constants::CRH_IVK_PERSONALIZATION,
    sapling::{PaymentAddress, ProofGenerationKey},
};
use zcash_proofs::{
    circuit::ecc::{self},
    constants::PROOF_GENERATION_KEY_GENERATOR,
};

use crate::{circuits::util::hash_asset_to_preimage, constants::ASSET_IDENTIFIER_PERSONALIZATION};

pub struct MintAsset {
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

    /// Private keys associated with the public key used to create the
    /// identifier
    pub proof_generation_key: Option<ProofGenerationKey>,
}

impl Circuit<bls12_381::Scalar> for MintAsset {
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

        multipack::pack_into_inputs(cs.namespace(|| "pack identifier"), &asset_identifier)?;

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
    use bls12_381::Bls12;
    use ff::Field;
    use group::{Group, GroupEncoding};
    use rand::{rngs::StdRng, SeedableRng};
    use zcash_primitives::sapling::{Diversifier, ProofGenerationKey};

    use crate::constants::{ASSET_IDENTIFIER_LENGTH, ASSET_IDENTIFIER_PERSONALIZATION};

    use super::MintAsset;

    #[test]
    fn test_mint_asset_circuit() {
        // Seed a fixed rng for determinstism in the test
        let seed = 1;
        let mut rng = StdRng::seed_from_u64(seed);

        let mut cs = TestConstraintSystem::new();

        let proof_generation_key = ProofGenerationKey {
            ak: jubjub::SubgroupPoint::random(&mut rng),
            nsk: jubjub::Fr::random(&mut rng),
        };

        let diversifier = Diversifier([0; 11]);

        let owner = proof_generation_key
            .to_viewing_key()
            .to_payment_address(diversifier)
            .unwrap();

        let name = [1u8; 32];
        let chain = [2u8; 32];
        let network = [3u8; 32];
        let nonce = 1u8;

        let mut asset_plaintext: Vec<u8> = vec![];
        asset_plaintext.extend(owner.g_d().unwrap().to_bytes());
        asset_plaintext.extend(owner.pk_d().to_bytes());
        asset_plaintext.extend(name);
        asset_plaintext.extend(chain);
        asset_plaintext.extend(network);
        asset_plaintext.extend(slice::from_ref(&nonce));

        let identifier = blake2s_simd::Params::new()
            .hash_length(ASSET_IDENTIFIER_LENGTH)
            .personal(ASSET_IDENTIFIER_PERSONALIZATION)
            .to_state()
            .update(&asset_plaintext)
            .finalize();

        let identifier_bits = multipack::bytes_to_bits_le(identifier.as_bytes());
        let public_inputs = multipack::compute_multipacking(&identifier_bits);

        // Mint proof
        let circuit = MintAsset {
            name,
            chain,
            network,
            owner: Some(owner),
            nonce,
            identifier: *identifier.as_array(),
            proof_generation_key: Some(proof_generation_key),
        };
        circuit.synthesize(&mut cs).unwrap();

        assert!(cs.is_satisfied());
        assert!(cs.verify(&public_inputs));
    }
}
