use bellman::{
    gadgets::{blake2s, boolean, multipack},
    Circuit,
};
use zcash_proofs::circuit::ecc;

use crate::{
    circuits::util::asset_info_preimage,
    constants::{proof::ASSET_KEY_GENERATOR, ASSET_IDENTIFIER_PERSONALIZATION},
};

pub struct MintAsset {
    /// Name of the asset
    pub name: [u8; 32],

    /// Identifier field for bridged asset address, or if a native custom asset, random bytes.
    /// Metadata for the asset (ex. chain, network, token identifier)
    pub metadata: [u8; 96],

    /// The random byte used to ensure we get a valid asset identifier
    pub nonce: u8,

    /// Private keys associated with the public key used to create the
    /// identifier
    pub asset_authorization_key: Option<jubjub::Fr>,
}

impl Circuit<bls12_381::Scalar> for MintAsset {
    fn synthesize<CS: bellman::ConstraintSystem<bls12_381::Scalar>>(
        self,
        cs: &mut CS,
    ) -> Result<(), bellman::SynthesisError> {
        let asset_authorization_key_bits = boolean::field_into_boolean_vec_le(
            cs.namespace(|| "booleanize asset authorization key"),
            self.asset_authorization_key,
        )?;

        let asset_public_key = ecc::fixed_base_multiplication(
            cs.namespace(|| "computation of asset public key"),
            &ASSET_KEY_GENERATOR,
            &asset_authorization_key_bits,
        )?;

        asset_public_key
            .assert_not_small_order(cs.namespace(|| "asset_public_key not small order"))?;

        // Create the Asset Info pre-image
        let identifier_preimage = asset_info_preimage(
            &mut cs.namespace(|| "asset info preimage"),
            self.name,
            self.metadata,
            asset_public_key,
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
        Circuit,
    };
    use ff::Field;
    use group::GroupEncoding;
    use rand::{rngs::StdRng, SeedableRng};

    use crate::constants::{
        ASSET_IDENTIFIER_LENGTH, ASSET_IDENTIFIER_PERSONALIZATION, ASSET_KEY_GENERATOR,
    };

    use super::MintAsset;

    #[test]
    fn test_mint_asset_circuit() {
        // Seed a fixed rng for determinstism in the test
        let seed = 1;
        let mut rng = StdRng::seed_from_u64(seed);

        let mut cs = TestConstraintSystem::new();

        let asset_auth_key = jubjub::Fr::random(&mut rng);
        let asset_public_key = ASSET_KEY_GENERATOR * asset_auth_key;

        let name = [1u8; 32];
        let metadata = [2u8; 96];
        let nonce = 1u8;

        let mut asset_plaintext: Vec<u8> = vec![];
        asset_plaintext.extend(&asset_public_key.to_bytes());
        asset_plaintext.extend(name);
        asset_plaintext.extend(metadata);
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
            metadata,
            nonce,
            asset_authorization_key: Some(asset_auth_key),
        };
        circuit.synthesize(&mut cs).unwrap();

        assert!(cs.is_satisfied());
        assert!(cs.verify(&public_inputs));
    }
}
