use ff::PrimeField;
use ironfish_bellperson::{
    gadgets::{blake2s, boolean},
    Circuit,
};
use ironfish_proofs::{
    circuit::ecc,
    constants::{PROOF_GENERATION_KEY_GENERATOR, SPENDING_KEY_GENERATOR},
};
use std::io::{Read, Write};

use crate::{
    constants::{proof::PUBLIC_KEY_GENERATOR, CRH_IVK_PERSONALIZATION},
    ProofGenerationKey,
};
use byteorder::{ReadBytesExt, WriteBytesExt};

use super::util::FromBytes;

#[derive(Clone, Debug)]
pub struct MintAsset {
    /// Key required to construct proofs for a particular spending key
    pub proof_generation_key: Option<ProofGenerationKey>,

    /// Used to add randomness to signature generation without leaking the
    /// key. Referred to as `ar` in the literature.
    pub public_key_randomness: Option<ironfish_jubjub::Fr>,
}

impl MintAsset {
    pub fn write<W: Write>(&self, mut writer: W) -> std::io::Result<()> {
        if let Some(ref proof_generation_key) = self.proof_generation_key {
            writer.write_u8(1)?;
            writer.write_all(proof_generation_key.to_bytes().as_ref())?;
        } else {
            writer.write_u8(0)?;
        }
        if let Some(ref public_key_randomness) = self.public_key_randomness {
            writer.write_u8(1)?;
            writer.write_all(public_key_randomness.to_bytes().as_ref())?;
        } else {
            writer.write_u8(0)?;
        }
        Ok(())
    }

    pub fn read<R: Read>(mut reader: R) -> std::io::Result<MintAsset> {
        let mut proof_generation_key = None;
        if reader.read_u8()? == 1 {
            proof_generation_key = Some(ProofGenerationKey::read(&mut reader)?);
        }
        let mut public_key_randomness = None;
        if reader.read_u8()? == 1 {
            public_key_randomness = Some(ironfish_jubjub::Fr::read(&mut reader)?);
        }
        Ok(MintAsset {
            proof_generation_key,
            public_key_randomness,
        })
    }
}

impl Circuit<blstrs::Scalar> for MintAsset {
    fn synthesize<CS: ironfish_bellperson::ConstraintSystem<blstrs::Scalar>>(
        self,
        cs: &mut CS,
    ) -> Result<(), ironfish_bellperson::SynthesisError> {
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
            let ar = boolean::field_into_boolean_vec_le(
                cs.namespace(|| "ar"),
                self.public_key_randomness,
            )?;

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

        // Extend ivk preimage with the representation of nk.
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
        ivk.truncate(ironfish_jubjub::Fr::CAPACITY as usize);

        // Compute owner public address
        let owner_public_address = ecc::fixed_base_multiplication(
            cs.namespace(|| "compute pk_d"),
            &PUBLIC_KEY_GENERATOR,
            &ivk,
        )?;

        owner_public_address.inputize(cs.namespace(|| "owner public address"))?;

        Ok(())
    }
}

#[cfg(test)]
mod test {
    use ff::Field;
    use group::{Curve, Group};
    use ironfish_bellperson::{gadgets::test::TestConstraintSystem, Circuit, ConstraintSystem};
    use ironfish_jubjub::ExtendedPoint;
    use rand::{rngs::StdRng, SeedableRng};

    use crate::{constants::PUBLIC_KEY_GENERATOR, ProofGenerationKey};

    use super::MintAsset;

    #[test]
    fn test_mint_asset_circuit() {
        // Seed a fixed rng for determinism in the test
        let mut rng = StdRng::seed_from_u64(0);

        let mut cs = TestConstraintSystem::new();

        let proof_generation_key = ProofGenerationKey::new(
            ironfish_jubjub::SubgroupPoint::random(&mut rng),
            ironfish_jubjub::Fr::random(&mut rng),
        );
        let incoming_view_key = proof_generation_key.to_viewing_key();
        let public_address = *PUBLIC_KEY_GENERATOR * incoming_view_key.ivk().0;
        let public_address_point = ExtendedPoint::from(public_address).to_affine();

        let public_key_randomness = ironfish_jubjub::Fr::random(&mut rng);
        let randomized_public_key =
            ExtendedPoint::from(incoming_view_key.rk(public_key_randomness)).to_affine();

        let public_inputs = vec![
            randomized_public_key.get_u(),
            randomized_public_key.get_v(),
            public_address_point.get_u(),
            public_address_point.get_v(),
        ];

        // Mint proof
        let circuit = MintAsset {
            proof_generation_key: Some(proof_generation_key),
            public_key_randomness: Some(public_key_randomness),
        };
        circuit.synthesize(&mut cs).unwrap();

        assert!(cs.is_satisfied());
        assert!(cs.verify(&public_inputs));
        assert_eq!(cs.num_constraints(), 25341);

        // Bad randomized public key
        let bad_randomized_public_key_point = ExtendedPoint::random(&mut rng).to_affine();
        let mut bad_inputs = public_inputs.clone();
        bad_inputs[0] = bad_randomized_public_key_point.get_u();

        assert!(!cs.verify(&bad_inputs));

        // Bad public address
        let bad_public_address = ExtendedPoint::random(&mut rng).to_affine();
        let mut bad_inputs = public_inputs.clone();
        bad_inputs[2] = bad_public_address.get_u();

        // Sanity check
        assert!(cs.verify(&public_inputs));
    }

    #[test]
    fn test_mint_asset_read_write() {
        // Seed a fixed RNG for determinism in the test
        let mut rng = StdRng::seed_from_u64(0);

        // Create a MintAsset instance with random data
        let proof_generation_key = ProofGenerationKey::new(
            ironfish_jubjub::SubgroupPoint::random(&mut rng),
            ironfish_jubjub::Fr::random(&mut rng),
        );
        let public_key_randomness = ironfish_jubjub::Fr::random(&mut rng);

        let mint_asset = MintAsset {
            proof_generation_key: Some(proof_generation_key.clone()),
            public_key_randomness: Some(public_key_randomness),
        };

        let mut buffer = vec![];
        mint_asset.write(&mut buffer).unwrap();

        let deserialized_mint_asset = MintAsset::read(&buffer[..]).unwrap();

        assert_eq!(
            mint_asset.proof_generation_key.clone().unwrap().ak,
            deserialized_mint_asset
                .proof_generation_key
                .clone()
                .unwrap()
                .ak
        );
        assert_eq!(
            mint_asset.proof_generation_key.clone().unwrap().nsk,
            deserialized_mint_asset
                .proof_generation_key
                .clone()
                .unwrap()
                .nsk
        );
        assert_eq!(
            mint_asset.public_key_randomness.unwrap(),
            deserialized_mint_asset.public_key_randomness.unwrap()
        );
    }
}
