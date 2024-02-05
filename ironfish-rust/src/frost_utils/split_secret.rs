/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use ironfish_frost::frost::{
    frost::keys::split,
    keys::{IdentifierList, KeyPackage, PublicKeyPackage},
    Identifier, SigningKey,
};
use rand::rngs::ThreadRng;
use std::collections::HashMap;

use crate::errors::{IronfishError, IronfishErrorKind};

pub struct SecretShareConfig {
    pub min_signers: u16,
    pub identifiers: Vec<Identifier>,
    pub secret: Vec<u8>,
}

pub(crate) fn split_secret(
    config: &SecretShareConfig,
    rng: &mut ThreadRng,
) -> Result<(HashMap<Identifier, KeyPackage>, PublicKeyPackage), IronfishError> {
    let secret_bytes: [u8; 32] = config
        .secret
        .clone()
        .try_into()
        .map_err(|_| IronfishError::new(IronfishErrorKind::InvalidSecret))?;

    let secret_key = SigningKey::deserialize(secret_bytes)?;

    let identifier_list = IdentifierList::Custom(&config.identifiers);

    let (shares, pubkeys) = split(
        &secret_key,
        config.identifiers.len() as u16,
        config.min_signers,
        identifier_list,
        rng,
    )?;

    for (_k, v) in shares.clone() {
        KeyPackage::try_from(v)?;
    }

    let mut key_packages: HashMap<_, _> = HashMap::new();

    for (identifier, secret_share) in shares {
        let key_package = KeyPackage::try_from(secret_share.clone())?;
        key_packages.insert(identifier, key_package);
    }

    Ok((key_packages, pubkeys))
}

#[cfg(test)]
mod test {
    use super::*;
    use crate::{keys::SaplingKey, test_util::create_identifiers};
    use ironfish_frost::frost::{frost::keys::reconstruct, JubjubBlake2b512};

    #[test]
    fn test_invalid_secret() {
        let identifiers = create_identifiers(10);

        let vec = vec![1; 31];
        let config = SecretShareConfig {
            min_signers: 2,
            identifiers,
            secret: vec,
        };

        let mut rng = rand::thread_rng();
        let result = split_secret(&config, &mut rng);
        assert!(result.is_err());
        assert!(
            matches!(result.unwrap_err().kind, IronfishErrorKind::InvalidSecret),
            "expected InvalidSecret error"
        );
    }

    #[test]
    fn test_split_secret() {
        let identifiers = create_identifiers(10);
        let identifiers_length = identifiers.len();

        let mut rng = rand::thread_rng();

        let key = SaplingKey::generate_key().spend_authorizing_key.to_bytes();

        let config = SecretShareConfig {
            min_signers: 2,
            identifiers,
            secret: key.to_vec(),
        };

        let (key_packages, _) = split_secret(&config, &mut rng).unwrap();
        assert_eq!(key_packages.len(), identifiers_length);

        let key_parts: Vec<_> = key_packages.values().cloned().collect();

        let signing_key =
            reconstruct::<JubjubBlake2b512>(&key_parts).expect("key reconstruction failed");

        let scalar = signing_key.to_scalar();

        assert_eq!(scalar.to_bytes(), key);
    }
}
