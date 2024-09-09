/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use ironfish_frost::participant::Identity;
use ironfish_frost::{
    dkg::round3::PublicKeyPackage,
    frost::{
        frost::keys::split,
        keys::{IdentifierList, KeyPackage},
        SigningKey,
    },
};
use rand::{CryptoRng, RngCore};
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    hash::Hash,
};

use crate::errors::{IronfishError, IronfishErrorKind};
use crate::SaplingKey;

/// Checks a sequence for duplicates; if any, the first duplicate found is returned as an error,
/// else the whole sequence is returned as a `HashSet`
fn find_dupes<I>(it: I) -> Result<HashSet<I::Item>, I::Item>
where
    I: IntoIterator,
    I::Item: Eq + Hash,
    I::IntoIter: ExactSizeIterator,
{
    let it = it.into_iter();
    let mut set = HashSet::with_capacity(it.len());
    for item in it {
        if let Some(dupe) = set.replace(item) {
            return Err(dupe);
        }
    }
    Ok(set)
}

pub(crate) fn split_secret<R: RngCore + CryptoRng>(
    spender_key: &SaplingKey,
    identities: &[Identity],
    min_signers: u16,
    mut rng: R,
) -> Result<(HashMap<Identity, KeyPackage>, PublicKeyPackage), IronfishError> {
    // Catch duplicate identities. We could in theory just remove duplicates, but doing so might
    // give users the impression that the maximum number of signers is `identities.len()`, while
    // it's actually lower than that.
    let identities = find_dupes(identities.iter().cloned()).map_err(|dupe| {
        IronfishError::new_with_source(
            IronfishErrorKind::InvalidData,
            format!("duplicate identity: {:?}", dupe),
        )
    })?;
    let num_identities = identities.len();

    let mut frost_id_map = identities
        .iter()
        .cloned()
        .map(|identity| (identity.to_frost_identifier(), identity))
        .collect::<BTreeMap<_, _>>();
    assert_eq!(
        num_identities,
        frost_id_map.len(),
        "frost identitifer collision"
    );

    let frost_ids = frost_id_map.keys().cloned().collect::<Vec<_>>();
    let identifier_list = IdentifierList::Custom(&frost_ids[..]);

    let secret_key = SigningKey::deserialize(&spender_key.spend_authorizing_key.to_bytes()[..])?;
    let max_signers: u16 = num_identities.try_into()?;

    let (shares, pubkeys) = split(
        &secret_key,
        max_signers,
        min_signers,
        identifier_list,
        &mut rng,
    )?;

    let mut key_packages = HashMap::new();
    for (frost_id, secret_share) in shares {
        let identity = frost_id_map
            .remove(&frost_id)
            .expect("frost returned an identifier that was not passed as an input");
        let key_package = KeyPackage::try_from(secret_share)?;
        key_packages.insert(identity, key_package);
    }

    let public_key_package = PublicKeyPackage::from_frost(pubkeys, identities, min_signers);

    Ok((key_packages, public_key_package))
}

#[cfg(test)]
mod test {
    use super::*;
    use crate::{keys::SaplingKey, test_util::create_multisig_identities};
    use ironfish_frost::frost::{frost::keys::reconstruct, JubjubBlake2b512};
    use rand::thread_rng;

    #[test]
    fn test_split_secret() {
        let identities = create_multisig_identities(10);
        let identities_length = identities.len();

        let key = SaplingKey::generate_key();

        let (key_packages, _) = split_secret(&key, &identities, 2, thread_rng()).unwrap();
        assert_eq!(key_packages.len(), identities_length);

        let key_parts: Vec<_> = key_packages.values().cloned().collect();

        let signing_key =
            reconstruct::<JubjubBlake2b512>(&key_parts).expect("key reconstruction failed");

        let scalar = signing_key.to_scalar();

        assert_eq!(scalar.to_bytes(), key.spend_authorizing_key.to_bytes());
    }
}
