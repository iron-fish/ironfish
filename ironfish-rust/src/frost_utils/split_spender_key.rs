/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use group::GroupEncoding;
use ironfish_frost::frost::{
    frost::keys::IdentifierList,
    keys::{KeyPackage, PublicKeyPackage},
    Identifier,
};
use ironfish_zkp::{constants::PROOF_GENERATION_KEY_GENERATOR, ProofGenerationKey};
use jubjub::SubgroupPoint;
use rand::thread_rng;
use std::collections::HashMap;

use crate::{IncomingViewKey, OutgoingViewKey, PublicAddress, SaplingKey, ViewKey};

use super::split_secret::{split_secret, SecretShareConfig};

type AuthorizingKey = [u8; 32];

pub struct TrustedDealerKeyPackages {
    pub ak: AuthorizingKey,
    pub pgk: ProofGenerationKey,
    pub vk: ViewKey,
    pub ivk: IncomingViewKey,
    pub ovk: OutgoingViewKey,
    pub address: PublicAddress,
    pub key_packages: HashMap<Identifier, KeyPackage>,
    pub pubkeys: PublicKeyPackage,
}

pub fn split_spender_key(
    coordinator_sapling_key: SaplingKey,
    min_signers: u16,
    max_signers: u16,
    secret: Vec<u8>,
) -> TrustedDealerKeyPackages {
    let secret_config = SecretShareConfig {
        min_signers,
        max_signers,
        secret,
    };

    let mut rng = thread_rng();
    let (key_packages, pubkeys) =
        split_secret(&secret_config, IdentifierList::Default, &mut rng).unwrap();

    let authorizing_key_bytes = pubkeys.verifying_key().serialize();

    let authorizing_key = SubgroupPoint::from_bytes(&authorizing_key_bytes).unwrap();

    let proof_generation_key = ProofGenerationKey {
        ak: authorizing_key,
        nsk: coordinator_sapling_key.sapling_proof_generation_key().nsk,
    };

    let nullifier_deriving_key = *PROOF_GENERATION_KEY_GENERATOR
        * coordinator_sapling_key.sapling_proof_generation_key().nsk;

    let view_key = ViewKey {
        authorizing_key,
        nullifier_deriving_key,
    };

    let incoming_viewing_key = coordinator_sapling_key.incoming_view_key().clone();

    let outgoing_view_key: OutgoingViewKey = coordinator_sapling_key.outgoing_view_key().clone();

    let public_address = incoming_viewing_key.public_address();

    TrustedDealerKeyPackages {
        ak: authorizing_key.to_bytes(),
        pgk: proof_generation_key,
        vk: view_key,
        ivk: incoming_viewing_key,
        ovk: outgoing_view_key,
        address: public_address,
        key_packages,
        pubkeys,
    }
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn test_split_spender_key() {
        let key = SaplingKey::generate_key();
        let secret = key.spend_authorizing_key.to_bytes().to_vec();

        let _spender_key_config = split_spender_key(key, 2, 3, secret);
    }
}
