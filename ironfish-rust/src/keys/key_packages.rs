use std::collections::HashMap;

use ironfish_zkp::ProofGenerationKey;
use reddsa::frost::redjubjub::keys::{KeyPackage, PublicKeyPackage};
use reddsa::frost::redjubjub::Identifier;

use crate::{ViewKey, IncomingViewKey, OutgoingViewKey, PublicAddress};

pub struct TrustedDealerKeyPackages {
    pub(crate) authorizing_key: [u8; 32], // verifying_key in FROST terms
    pub(crate) proof_generation_key: ProofGenerationKey,
    pub(crate) view_key: ViewKey,
    pub(crate) incoming_view_key: IncomingViewKey,
    pub(crate) outgoing_view_key: OutgoingViewKey,
    pub(crate) public_address: PublicAddress,
    pub(crate) key_packages: HashMap<Identifier, KeyPackage>,
    pub(crate) public_key_package: PublicKeyPackage,
}