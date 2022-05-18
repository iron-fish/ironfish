/// Length in bytes of the asset identifier
pub const ASSET_IDENTIFIER_LENGTH: usize = 32;

/// BLAKE2s personalization for deriving asset identifier from asset name
// TODO: Come up with a better string
pub const ASSET_IDENTIFIER_PERSONALIZATION: &[u8; 8] = b"ironf_A_";
