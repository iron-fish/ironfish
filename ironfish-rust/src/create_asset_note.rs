// TODO: Decide on a name?
// CreateAssetNote?
// AssetNote?
// What's less confusing when talking about it and trying to differentiate
// between a regular "Note"

use rand::{thread_rng, Rng};

use crate::{primitives::asset_type::AssetInfo, AssetType};

/// A create asset note represents an asset in the owner's "account"
/// Expected API:
/// let can = CreateAssetNote::new(asset_info);
/// proposed_transaction.create_asset(spender_key, &can);
/// proposed_transaction.post, verify, etc.
pub struct CreateAssetNote {
    pub(crate) asset_info: AssetInfo,
    pub(crate) randomness: jubjub::Fr,
}

impl CreateAssetNote {
    // TODO: carry over all? fns from Note
    pub fn new(asset_info: AssetInfo) -> Self {
        let mut buffer = [0u8; 64];
        thread_rng().fill(&mut buffer[..]);

        let randomness: jubjub::Fr = jubjub::Fr::from_bytes_wide(&buffer);

        Self {
            asset_info,
            randomness,
        }
    }
}
