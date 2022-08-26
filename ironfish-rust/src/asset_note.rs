use rand::{thread_rng, Rng};

use crate::primitives::asset_type::AssetInfo;

#[derive(Clone)]
pub struct AssetNote {
    // TODO: Should this just be asset identifier or something?
    asset_info: AssetInfo,

    randomness: jubjub::Fr,
    // TODO: eventually this will include flags like isMintable etc
}

impl AssetNote {
    // TODO: Research whether idiomatic rust is to use Self or the struct name
    pub fn new(asset_info: AssetInfo) -> Self {
        let mut buffer = [0u8; 64];
        thread_rng().fill(&mut buffer[..]);

        let randomness = jubjub::Fr::from_bytes_wide(&buffer);

        Self {
            asset_info,
            randomness,
        }
    }
}
