/// Length in bytes of the asset identifier
pub(crate) const ASSET_IDENTIFIER_LENGTH: usize = 32;

/// BLAKE2s personalization for deriving asset identifier from asset name
pub(crate) const ASSET_IDENTIFIER_PERSONALIZATION: &[u8; 8] = b"ironf_A_";
