/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

//! Implement a merkle note to store all the values that need to go into a merkle tree.
//! A tree containing these values can serve as a snapshot of the entire chain.

use crate::{
    errors::IronfishError,
    keys::EphemeralKeyPair,
    keys::{shared_secret, IncomingViewKey, OutgoingViewKey, PublicAddress},
    note::{Note, ENCRYPTED_NOTE_SIZE},
    serializing::{aead, read_scalar},
    serializing::{read_point, read_point_unchecked},
    MerkleNoteHash,
};
use blake2b_simd::Params as Blake2b;
use blstrs::Scalar;
use ff::PrimeField;
use group::GroupEncoding;
use ironfish_jubjub::{ExtendedPoint, SubgroupPoint};
use ironfish_zkp::primitives::ValueCommitment;
use std::{convert::TryInto, io};

#[cfg(feature = "transaction-proofs")]
use crate::witness::{WitnessNode, WitnessTrait};

pub const ENCRYPTED_SHARED_KEY_SIZE: usize = 64;

pub const NOTE_ENCRYPTION_KEY_SIZE: usize = ENCRYPTED_SHARED_KEY_SIZE + aead::MAC_SIZE;
/// The note encryption keys are used to allow the spender to
/// read notes that they have themselves have spent.
/// In the case of miner notes, the note is created out of thin air
/// and there is no actual spender. We set the note encryption keys
/// to a known value, but this isn't enforced in consensus, so any
/// value is valid.
///
/// This does not leak information, since miner notes are already known
/// to be on the first transaction in a block.
pub const NOTE_ENCRYPTION_MINER_KEYS: &[u8; NOTE_ENCRYPTION_KEY_SIZE] =
    b"Iron Fish note encryption miner key000000000000000000000000000000000000000000000";
const SHARED_KEY_PERSONALIZATION: &[u8; 16] = b"Iron Fish Keyenc";

#[derive(Clone, Debug)]
pub struct MerkleNote {
    /// Randomized value commitment. Sometimes referred to as
    /// `cv` in the literature. It's calculated by multiplying a value by a
    /// random number. Commits this note to the value it contains
    /// without revealing what that value is.
    pub(crate) value_commitment: ExtendedPoint,

    /// The hash of the note, committing to it's internal state
    pub(crate) note_commitment: Scalar,

    /// Public part of ephemeral diffie-hellman key-pair. See the discussion on
    /// [`shared_secret`] to understand how this is used
    pub(crate) ephemeral_public_key: SubgroupPoint,

    /// note as encrypted by the diffie hellman public key
    pub(crate) encrypted_note: [u8; ENCRYPTED_NOTE_SIZE + aead::MAC_SIZE],

    /// Keys used to encrypt the note. These are stored in encrypted format
    /// using the spender's outgoing viewing key, and allow the spender to
    /// decrypt it. The receiver (owner) doesn't need these, as they can decrypt
    /// the note directly using their incoming viewing key.
    pub(crate) note_encryption_keys: [u8; NOTE_ENCRYPTION_KEY_SIZE],
}

impl PartialEq for MerkleNote {
    fn eq(&self, other: &MerkleNote) -> bool {
        self.note_commitment == other.note_commitment
            && self.value_commitment == other.value_commitment
    }
}

impl Eq for MerkleNote {}

impl MerkleNote {
    pub fn new(
        outgoing_view_key: &OutgoingViewKey,
        note: &Note,
        value_commitment: &ValueCommitment,
        diffie_hellman_keys: &EphemeralKeyPair,
    ) -> MerkleNote {
        let secret_key = diffie_hellman_keys.secret();
        let public_key = diffie_hellman_keys.public();

        let mut key_bytes = [0; 64];
        key_bytes[..32].copy_from_slice(&note.owner.0.to_bytes());
        key_bytes[32..].clone_from_slice(secret_key.to_repr().as_ref());

        let encryption_key = calculate_key_for_encryption_keys(
            outgoing_view_key,
            &value_commitment.commitment().into(),
            &note.commitment_point(),
            public_key,
        );
        let note_encryption_keys: [u8; NOTE_ENCRYPTION_KEY_SIZE] =
            aead::encrypt(&encryption_key, &key_bytes).unwrap();

        Self::construct(
            note,
            value_commitment,
            diffie_hellman_keys,
            note_encryption_keys,
        )
    }

    /// Helper function to instantiate a MerkleNote with pre-set
    /// note_encryption_keys. Should only be used for miners fee transactions.
    #[cfg(feature = "transaction-proofs")]
    pub(crate) fn new_for_miners_fee(
        note: &Note,
        value_commitment: &ValueCommitment,
        diffie_hellman_keys: &EphemeralKeyPair,
    ) -> MerkleNote {
        let note_encryption_keys = *NOTE_ENCRYPTION_MINER_KEYS;

        Self::construct(
            note,
            value_commitment,
            diffie_hellman_keys,
            note_encryption_keys,
        )
    }

    /// Helper function to cut down on duplicated code between
    /// `MerkleNote::new` and `MerkleNote::new_for_miners_fee`. Should not
    /// be used directly.
    fn construct(
        note: &Note,
        value_commitment: &ValueCommitment,
        diffie_hellman_keys: &EphemeralKeyPair,
        note_encryption_keys: [u8; NOTE_ENCRYPTION_KEY_SIZE],
    ) -> MerkleNote {
        #[cfg(feature = "note-encryption-stats")]
        stats::inc_construct();

        let secret_key = diffie_hellman_keys.secret();
        let public_key = diffie_hellman_keys.public();

        let encrypted_note = note.encrypt(&shared_secret(secret_key, &note.owner.0, public_key));

        MerkleNote {
            value_commitment: value_commitment.commitment().into(),
            note_commitment: note.commitment_point(),
            ephemeral_public_key: (*public_key),
            encrypted_note,
            note_encryption_keys,
        }
    }

    /// Load a MerkleNote from the given reader.
    pub fn read<R: io::Read>(mut reader: R) -> Result<Self, IronfishError> {
        let value_commitment = read_point(&mut reader)?;
        let note_commitment = read_scalar(&mut reader)?;
        let ephemeral_public_key = read_point(&mut reader)?;

        let mut encrypted_note = [0; ENCRYPTED_NOTE_SIZE + aead::MAC_SIZE];
        reader.read_exact(&mut encrypted_note[..])?;
        let mut note_encryption_keys = [0; NOTE_ENCRYPTION_KEY_SIZE];
        reader.read_exact(&mut note_encryption_keys[..])?;

        Ok(MerkleNote {
            value_commitment,
            note_commitment,
            ephemeral_public_key,
            encrypted_note,
            note_encryption_keys,
        })
    }

    /// Load a MerkleNote from the given reader, skipping some expensive validity checks on the
    /// input.
    ///
    /// This method is faster than [`read()`], but it requires trusted or pre-validated input.
    /// Passing invalid input may result in erroneous calculations or security risks.
    pub fn read_unchecked<R: io::Read>(mut reader: R) -> Result<Self, IronfishError> {
        let value_commitment = read_point_unchecked(&mut reader)?;
        let note_commitment = read_scalar(&mut reader)?;
        let ephemeral_public_key = read_point_unchecked(&mut reader)?;

        let mut encrypted_note = [0; ENCRYPTED_NOTE_SIZE + aead::MAC_SIZE];
        reader.read_exact(&mut encrypted_note[..])?;
        let mut note_encryption_keys = [0; NOTE_ENCRYPTION_KEY_SIZE];
        reader.read_exact(&mut note_encryption_keys[..])?;

        Ok(MerkleNote {
            value_commitment,
            note_commitment,
            ephemeral_public_key,
            encrypted_note,
            note_encryption_keys,
        })
    }

    pub fn write<W: io::Write>(&self, writer: &mut W) -> Result<(), IronfishError> {
        writer.write_all(&self.value_commitment.to_bytes())?;
        writer.write_all(&self.note_commitment.to_bytes_le())?;
        writer.write_all(&self.ephemeral_public_key.to_bytes())?;
        writer.write_all(&self.encrypted_note)?;
        writer.write_all(&self.note_encryption_keys)?;

        Ok(())
    }

    pub fn merkle_hash(&self) -> MerkleNoteHash {
        MerkleNoteHash::new(self.note_commitment)
    }

    pub fn decrypt_note_for_owner(
        &self,
        owner_view_key: &IncomingViewKey,
    ) -> Result<Note, IronfishError> {
        #[cfg(feature = "note-encryption-stats")]
        stats::inc_decrypt_note_for_owner(1);

        let shared_secret = owner_view_key.shared_secret(&self.ephemeral_public_key);
        let note =
            Note::from_owner_encrypted(owner_view_key, &shared_secret, &self.encrypted_note)?;
        note.verify_commitment(self.note_commitment)?;

        #[cfg(feature = "note-encryption-stats")]
        stats::inc_decrypt_note_for_owner_ok(1);
        Ok(note)
    }

    pub fn decrypt_note_for_owners(
        &self,
        owner_view_keys: &[IncomingViewKey],
    ) -> Vec<Result<Note, IronfishError>> {
        #[cfg(feature = "note-encryption-stats")]
        stats::inc_decrypt_note_for_owner(owner_view_keys.len());

        let shared_secrets =
            IncomingViewKey::shared_secrets(owner_view_keys, &self.ephemeral_public_key);

        let result = owner_view_keys
            .iter()
            .zip(shared_secrets.iter())
            .map(move |(owner_view_key, shared_secret)| {
                let note = Note::from_owner_encrypted(
                    owner_view_key,
                    shared_secret,
                    &self.encrypted_note,
                )?;
                note.verify_commitment(self.note_commitment)?;
                Ok(note)
            })
            .collect::<Vec<Result<Note, IronfishError>>>();

        #[cfg(feature = "note-encryption-stats")]
        stats::inc_decrypt_note_for_owner_ok(result.iter().filter(move |res| res.is_ok()).count());

        result
    }

    pub fn decrypt_note_for_spender(
        &self,
        spender_key: &OutgoingViewKey,
    ) -> Result<Note, IronfishError> {
        #[cfg(feature = "note-encryption-stats")]
        stats::inc_decrypt_note_for_spender();

        let encryption_key = calculate_key_for_encryption_keys(
            spender_key,
            &self.value_commitment,
            &self.note_commitment,
            &self.ephemeral_public_key,
        );

        let note_encryption_keys: [u8; ENCRYPTED_SHARED_KEY_SIZE] =
            aead::decrypt(&encryption_key, &self.note_encryption_keys)?;
        let public_address = PublicAddress::new(&note_encryption_keys[..32].try_into().unwrap())?;
        let secret_key = read_scalar(&note_encryption_keys[32..])?;
        let shared_key = shared_secret(&secret_key, &public_address.0, &self.ephemeral_public_key);
        let note =
            Note::from_spender_encrypted(public_address.0, &shared_key, &self.encrypted_note)?;
        note.verify_commitment(self.note_commitment)?;

        #[cfg(feature = "note-encryption-stats")]
        stats::inc_decrypt_note_for_spender_ok();
        Ok(note)
    }
}

#[cfg(feature = "transaction-proofs")]
pub(crate) fn sapling_auth_path<W: WitnessTrait + ?Sized>(
    witness: &W,
) -> Vec<Option<(Scalar, bool)>> {
    let mut auth_path = vec![];
    for element in &witness.get_auth_path() {
        let sapling_element = match element {
            WitnessNode::Left(ref sibling_hash) => Some((*sibling_hash, false)),
            WitnessNode::Right(ref sibling_hash) => Some((*sibling_hash, true)),
        };
        auth_path.push(sapling_element);
    }
    auth_path
}

/// Calculate the position of a leaf node from it's witness, assuming the
/// auth path is from a fixed-sized complete merkle tree.
///
/// This can't just be a default method on the Witness trait, since it relies
/// on an assumption that the tree is complete and binary. And I didn't feel
/// like making Witness a trait since it's otherwise very simple.
/// So this hacky function gets to live here.
#[cfg(feature = "transaction-proofs")]
pub(crate) fn position<W: WitnessTrait + ?Sized>(witness: &W) -> u64 {
    let mut pos = 0;
    for (i, element) in witness.get_auth_path().iter().enumerate() {
        if let WitnessNode::Right(_) = element {
            pos |= 1 << i;
        }
    }
    pos
}

/// Calculate the key used to encrypt the shared keys for an [`crate::outputs::OutputDescription`].
///
/// The shared keys are encrypted using the outgoing viewing key for the
/// spender (the person creating the note owned by the receiver). This gets
/// combined with hashes of the output values to make a key unique to, and
/// signed by, the output.
///
/// Naming is getting a bit far-fetched here because it's the keys used to
/// encrypt other keys. Keys, all the way down!
fn calculate_key_for_encryption_keys(
    outgoing_view_key: &OutgoingViewKey,
    value_commitment: &ExtendedPoint,
    note_commitment: &Scalar,
    public_key: &SubgroupPoint,
) -> [u8; 32] {
    let mut key_input = [0u8; 128];
    key_input[0..32].copy_from_slice(&outgoing_view_key.view_key);
    key_input[32..64].copy_from_slice(&value_commitment.to_bytes());
    key_input[64..96].copy_from_slice(note_commitment.to_repr().as_ref());
    key_input[96..128].copy_from_slice(&public_key.to_bytes());

    Blake2b::new()
        .hash_length(32)
        .personal(SHARED_KEY_PERSONALIZATION)
        .hash(&key_input)
        .as_bytes()
        .try_into()
        .expect("has has incorrect length")
}

#[cfg(feature = "note-encryption-stats")]
pub mod stats {
    use std::sync::atomic::AtomicUsize;
    use std::sync::atomic::Ordering::Relaxed;

    static CONSTRUCT_CALLS: AtomicUsize = AtomicUsize::new(0);

    static DECRYPT_FOR_OWNER_CALLS: AtomicUsize = AtomicUsize::new(0);
    static DECRYPT_FOR_OWNER_OK_CALLS: AtomicUsize = AtomicUsize::new(0);

    static DECRYPT_FOR_SPENDER_CALLS: AtomicUsize = AtomicUsize::new(0);
    static DECRYPT_FOR_SPENDER_OK_CALLS: AtomicUsize = AtomicUsize::new(0);

    /// Statistics on the operations performed by the [`ironfish::merkle_note`] module.
    #[derive(Copy, Clone, PartialEq, Eq, Debug)]
    pub struct Stats {
        /// Number of [`MerkleNote::construct()`] calls made so far.
        pub construct: usize,
        /// Number of [`MerkleNote::decrypt_note_for_owner()`] calls made so far.
        pub decrypt_note_for_owner: CallResultStats,
        /// Number of [`MerkleNote::decrypt_note_for_spender()`] calls made so far.
        pub decrypt_note_for_spender: CallResultStats,
    }

    /// Statistics for a function that returns a `Result`.
    #[derive(Copy, Clone, PartialEq, Eq, Debug)]
    pub struct CallResultStats {
        /// Number of calls to a function performed so far. This includes both successful (`Ok`)
        /// and unsuccessful (`Err`) calls.
        pub total: usize,
        /// Number of calls to a function performed so far that returned a successful (`Ok`)
        /// result.
        pub successful: usize,
    }

    #[inline(always)]
    pub(super) fn inc_construct() {
        CONSTRUCT_CALLS.fetch_add(1, Relaxed);
    }

    #[inline(always)]
    pub(super) fn inc_decrypt_note_for_owner(count: usize) {
        DECRYPT_FOR_OWNER_CALLS.fetch_add(count, Relaxed);
    }

    #[inline(always)]
    pub(super) fn inc_decrypt_note_for_owner_ok(count: usize) {
        DECRYPT_FOR_OWNER_OK_CALLS.fetch_add(count, Relaxed);
    }

    #[inline(always)]
    pub(super) fn inc_decrypt_note_for_spender() {
        DECRYPT_FOR_SPENDER_CALLS.fetch_add(1, Relaxed);
    }

    #[inline(always)]
    pub(super) fn inc_decrypt_note_for_spender_ok() {
        DECRYPT_FOR_SPENDER_OK_CALLS.fetch_add(1, Relaxed);
    }

    #[must_use]
    pub fn get() -> Stats {
        Stats {
            construct: CONSTRUCT_CALLS.load(Relaxed),
            decrypt_note_for_owner: CallResultStats {
                total: DECRYPT_FOR_OWNER_CALLS.load(Relaxed),
                successful: DECRYPT_FOR_OWNER_OK_CALLS.load(Relaxed),
            },
            decrypt_note_for_spender: CallResultStats {
                total: DECRYPT_FOR_SPENDER_CALLS.load(Relaxed),
                successful: DECRYPT_FOR_SPENDER_OK_CALLS.load(Relaxed),
            },
        }
    }
}

#[cfg(test)]
mod test {
    use super::MerkleNote;
    use super::NOTE_ENCRYPTION_MINER_KEYS;
    use crate::assets::asset_identifier::NATIVE_ASSET;
    use crate::keys::EphemeralKeyPair;
    use crate::{keys::SaplingKey, note::Note};

    use blstrs::Scalar;
    use ironfish_zkp::primitives::ValueCommitment;
    use rand::prelude::*;

    #[test]
    /// Test to confirm that creating a [`MerkleNote`] via new() doesn't use the
    /// hard-coded miners fee note encryption keys
    fn test_new_not_miners_fee_key() {
        let spender_key = SaplingKey::generate_key();
        let receiver_key = SaplingKey::generate_key();
        let note = Note::new(
            receiver_key.public_address(),
            42,
            "",
            NATIVE_ASSET,
            spender_key.public_address(),
        );
        let diffie_hellman_keys = EphemeralKeyPair::new();

        let value_commitment = ValueCommitment::new(note.value, note.asset_generator());

        let merkle_note = MerkleNote::new(
            spender_key.outgoing_view_key(),
            &note,
            &value_commitment,
            &diffie_hellman_keys,
        );

        assert_ne!(
            &merkle_note.note_encryption_keys,
            NOTE_ENCRYPTION_MINER_KEYS
        );
    }

    /// Test to confirm that creating a [`MerkleNote`] via new_for_miners_note()
    /// does use the hard-coded miners fee note encryption keys
    #[test]
    #[cfg(feature = "transaction-proofs")]
    fn test_new_miners_fee_key() {
        let receiver_key = SaplingKey::generate_key();
        let sender_key: SaplingKey = SaplingKey::generate_key();
        let note = Note::new(
            receiver_key.public_address(),
            42,
            "",
            NATIVE_ASSET,
            sender_key.public_address(),
        );
        let diffie_hellman_keys = EphemeralKeyPair::new();

        let value_commitment = ValueCommitment::new(note.value, note.asset_generator());

        let merkle_note =
            MerkleNote::new_for_miners_fee(&note, &value_commitment, &diffie_hellman_keys);

        assert_eq!(
            &merkle_note.note_encryption_keys,
            NOTE_ENCRYPTION_MINER_KEYS
        );
    }

    #[test]
    fn test_view_key_encryption() {
        let spender_key = SaplingKey::generate_key();
        let receiver_key = SaplingKey::generate_key();
        let note = Note::new(
            receiver_key.public_address(),
            42,
            "",
            NATIVE_ASSET,
            spender_key.public_address(),
        );
        let diffie_hellman_keys = EphemeralKeyPair::new();

        let value_commitment = ValueCommitment::new(note.value, note.asset_generator());

        let merkle_note = MerkleNote::new(
            spender_key.outgoing_view_key(),
            &note,
            &value_commitment,
            &diffie_hellman_keys,
        );
        merkle_note
            .decrypt_note_for_owner(receiver_key.incoming_view_key())
            .expect("should be able to decrypt note for owner");
        merkle_note
            .decrypt_note_for_spender(spender_key.outgoing_view_key())
            .expect("should be able to decrypt note for spender");

        assert!(merkle_note
            .decrypt_note_for_owner(spender_key.incoming_view_key())
            .is_err());
        assert!(merkle_note
            .decrypt_note_for_spender(receiver_key.outgoing_view_key())
            .is_err());
    }

    #[test]
    fn test_view_key_encryption_with_other_key() {
        let spender_key = SaplingKey::generate_key();
        let receiver_key = SaplingKey::generate_key();
        let third_party_key = SaplingKey::generate_key();
        let note = Note::new(
            receiver_key.public_address(),
            42,
            "",
            NATIVE_ASSET,
            spender_key.public_address(),
        );
        let diffie_hellman_keys = EphemeralKeyPair::new();

        let value_commitment = ValueCommitment::new(note.value, note.asset_generator());

        let merkle_note = MerkleNote::new(
            spender_key.outgoing_view_key(),
            &note,
            &value_commitment,
            &diffie_hellman_keys,
        );

        assert!(merkle_note
            .decrypt_note_for_owner(third_party_key.incoming_view_key())
            .is_err());
        assert!(merkle_note
            .decrypt_note_for_spender(third_party_key.outgoing_view_key())
            .is_err());
    }

    #[test]
    fn test_output_invalid_commitment() {
        let spender_key = SaplingKey::generate_key();
        let note = Note::new(
            spender_key.public_address(),
            42,
            "",
            NATIVE_ASSET,
            spender_key.public_address(),
        );
        let diffie_hellman_keys = EphemeralKeyPair::new();

        let value_commitment = ValueCommitment::new(note.value, note.asset_generator());

        let mut merkle_note = MerkleNote::new(
            spender_key.outgoing_view_key(),
            &note,
            &value_commitment,
            &diffie_hellman_keys,
        );
        merkle_note
            .decrypt_note_for_owner(spender_key.incoming_view_key())
            .expect("should be able to decrypt note for owner");
        merkle_note
            .decrypt_note_for_spender(spender_key.outgoing_view_key())
            .expect("should be able to decrypt note for spender");

        // should fail if note_commitment doesn't match
        let note_randomness: u64 = random();
        merkle_note.note_commitment = Scalar::from(note_randomness);
        assert!(merkle_note
            .decrypt_note_for_owner(spender_key.incoming_view_key())
            .is_err());
        assert!(merkle_note
            .decrypt_note_for_spender(spender_key.outgoing_view_key())
            .is_err());
    }

    #[test]
    fn test_serialization_roundtrip() {
        let spender_key = SaplingKey::generate_key();
        let note = Note::new(
            spender_key.public_address(),
            42,
            "",
            NATIVE_ASSET,
            spender_key.public_address(),
        );
        let diffie_hellman_keys = EphemeralKeyPair::new();

        let value_commitment = ValueCommitment::new(note.value, note.asset_generator());

        let merkle_note = MerkleNote::new(
            spender_key.outgoing_view_key(),
            &note,
            &value_commitment,
            &diffie_hellman_keys,
        );

        let mut serialization = Vec::new();

        merkle_note
            .write(&mut serialization)
            .expect("serialization failed");

        assert_eq!(
            MerkleNote::read(&serialization[..]).expect("deserialization failed"),
            merkle_note
        );
        assert_eq!(
            MerkleNote::read_unchecked(&serialization[..]).expect("deserialization failed"),
            merkle_note
        );
    }
}
