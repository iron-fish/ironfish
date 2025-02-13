/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::{
    assets::asset_identifier::AssetIdentifier,
    errors::{IronfishError, IronfishErrorKind},
    keys::PUBLIC_ADDRESS_SIZE,
    util::str_to_array,
    ViewKey,
};

use super::{
    keys::{IncomingViewKey, PublicAddress},
    serializing::{aead, read_scalar},
};
use blake2s_simd::Params as Blake2sParams;
use blstrs::Scalar;
use byteorder::{ByteOrder, LittleEndian, ReadBytesExt, WriteBytesExt};
use ff::{Field, PrimeField};
use group::{Curve, GroupEncoding};
use ironfish_jubjub::SubgroupPoint;
use ironfish_zkp::{
    constants::{ASSET_ID_LENGTH, NULLIFIER_POSITION_GENERATOR, PRF_NF_PERSONALIZATION},
    util::commitment_full_point,
    Nullifier,
};
use rand::thread_rng;
use std::{fmt, io, io::Read};

pub const ENCRYPTED_NOTE_SIZE: usize =
    SCALAR_SIZE + MEMO_SIZE + AMOUNT_VALUE_SIZE + ASSET_ID_LENGTH + PUBLIC_ADDRESS_SIZE;
//   8  value
// + 32 randomness
// + 32 asset id
// + 32 memo
// + 32 sender address
// = 136
pub const PLAINTEXT_NOTE_SIZE: usize = PUBLIC_ADDRESS_SIZE
    + ASSET_ID_LENGTH
    + AMOUNT_VALUE_SIZE
    + SCALAR_SIZE
    + MEMO_SIZE
    + PUBLIC_ADDRESS_SIZE;
pub const SCALAR_SIZE: usize = 32;
pub const MEMO_SIZE: usize = 32;
pub const AMOUNT_VALUE_SIZE: usize = 8;

/// Memo field on a Note. Used to encode transaction IDs or other information
/// about the transaction.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct Memo(pub [u8; MEMO_SIZE]);

impl From<&str> for Memo {
    fn from(string: &str) -> Self {
        let memo_bytes = str_to_array(string);
        Memo(memo_bytes)
    }
}

impl From<String> for Memo {
    fn from(string: String) -> Self {
        Memo::from(string.as_str())
    }
}

impl From<[u8; MEMO_SIZE]> for Memo {
    fn from(value: [u8; MEMO_SIZE]) -> Self {
        Memo(value)
    }
}

impl fmt::Display for Memo {
    /// This can be lossy because it assumes that the
    /// memo is in valid UTF-8 format.
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{}", String::from_utf8_lossy(&self.0))
    }
}

/// A note (think bank note) represents a value in the owner's "account".
/// When spending, proof that the note exists in the tree needs to be provided,
/// along with a nullifier key that is made public so the owner cannot attempt
/// to spend that note again.447903
///
/// When receiving funds, a new note needs to be created for the new owner
/// to hold those funds.
#[derive(Debug, PartialEq, Eq, Clone)]
pub struct Note {
    /// Asset identifier the note is associated with
    pub(crate) asset_id: AssetIdentifier,

    /// A public address for the owner of the note.
    pub(crate) owner: PublicAddress,

    /// Value this note represents.
    pub(crate) value: u64,

    /// A random value generated when the note is constructed.
    /// This helps create zero knowledge around the note,
    /// allowing the owner to prove they have the note without revealing
    /// anything else about it.
    pub(crate) randomness: ironfish_jubjub::Fr,

    /// Arbitrary note the spender can supply when constructing a spend so the
    /// receiver has some record from whence it came.
    /// Note: While this is encrypted with the output, it is not encoded into
    /// the proof in any way.
    pub(crate) memo: Memo,

    /// A public address for the sender of the note.
    pub(crate) sender: PublicAddress,
}

impl Note {
    /// Construct a new Note.
    pub fn new(
        owner: PublicAddress,
        value: u64,
        memo: impl Into<Memo>,
        asset_id: AssetIdentifier,
        sender: PublicAddress,
    ) -> Self {
        let randomness: ironfish_jubjub::Fr = ironfish_jubjub::Fr::random(thread_rng());

        Self {
            owner,
            asset_id,
            value,
            randomness,
            memo: memo.into(),
            sender,
        }
    }

    /// Read a note from the given stream IN PLAINTEXT.
    ///
    /// You probably don't want to use this unless you are transmitting
    /// across nodejs threads in memory.
    pub fn read<R: Read>(mut reader: R) -> Result<Self, IronfishError> {
        let owner = PublicAddress::read(&mut reader)?;

        let asset_id = AssetIdentifier::read(&mut reader)?;

        let value = reader.read_u64::<LittleEndian>()?;
        let randomness: ironfish_jubjub::Fr = read_scalar(&mut reader)?;

        let mut memo = Memo::default();
        reader.read_exact(&mut memo.0)?;

        let sender = PublicAddress::read(&mut reader)?;

        Ok(Self {
            owner,
            asset_id,
            value,
            randomness,
            memo,
            sender,
        })
    }

    /// Write the note to the given stream IN PLAINTEXT.
    ///
    /// This should generally never be used to serialize to disk or the network.
    /// It is primarily added as a device for transmitting the note across
    /// thread boundaries.
    pub fn write<W: io::Write>(&self, mut writer: W) -> Result<(), IronfishError> {
        self.owner.write(&mut writer)?;
        self.asset_id.write(&mut writer)?;
        writer.write_u64::<LittleEndian>(self.value)?;
        writer.write_all(&self.randomness.to_bytes())?;
        writer.write_all(&self.memo.0)?;
        self.sender.write(&mut writer)?;

        Ok(())
    }

    /// Create a note from its encrypted representation, given the owner's
    /// view key.
    ///
    /// The note is stored on the [`crate::outputs::OutputDescription`] in
    /// encrypted form. The spender encrypts it when they construct the output
    /// using a shared secret derived from the owner's public key.
    ///
    /// This function allows the owner to decrypt the note using the derived
    /// shared secret and their own view key.
    pub fn from_owner_encrypted(
        owner_view_key: &IncomingViewKey,
        shared_secret: &[u8; 32],
        encrypted_bytes: &[u8; ENCRYPTED_NOTE_SIZE + aead::MAC_SIZE],
    ) -> Result<Self, IronfishError> {
        let (randomness, asset_id, value, memo, sender) =
            Note::decrypt_note_parts(shared_secret, encrypted_bytes)?;
        let owner = owner_view_key.public_address();

        Ok(Note {
            owner,
            asset_id,
            value,
            randomness,
            memo,
            sender,
        })
    }

    /// Create a note from its encrypted representation, given the spender's
    /// view key.
    ///
    /// The note is stored on the [`crate::outputs::OutputDescription`] in
    /// encrypted form. The spender encrypts it when they construct the output
    /// using a shared secret derived from the owner's public key.
    ///
    /// This function allows the owner to decrypt the note using the derived
    /// shared secret and their own view key.
    pub(crate) fn from_spender_encrypted(
        public_address: SubgroupPoint,
        shared_secret: &[u8; 32],
        encrypted_bytes: &[u8; ENCRYPTED_NOTE_SIZE + aead::MAC_SIZE],
    ) -> Result<Self, IronfishError> {
        let (randomness, asset_id, value, memo, sender) =
            Note::decrypt_note_parts(shared_secret, encrypted_bytes)?;

        let owner = PublicAddress(public_address);

        Ok(Note {
            owner,
            asset_id,
            value,
            randomness,
            memo,
            sender,
        })
    }

    pub fn value(&self) -> u64 {
        self.value
    }

    pub fn memo(&self) -> Memo {
        self.memo
    }

    pub fn owner(&self) -> PublicAddress {
        self.owner
    }

    pub fn asset_generator(&self) -> ironfish_jubjub::ExtendedPoint {
        self.asset_id.asset_generator()
    }

    pub fn asset_id(&self) -> &AssetIdentifier {
        &self.asset_id
    }

    pub fn sender(&self) -> PublicAddress {
        self.sender
    }

    /// Send encrypted form of the note, which is what gets publicly stored on
    /// the tree. Only someone with the incoming viewing key for the note can
    /// actually read the contents.
    pub fn encrypt(&self, shared_secret: &[u8; 32]) -> [u8; ENCRYPTED_NOTE_SIZE + aead::MAC_SIZE] {
        let mut bytes_to_encrypt = [0; ENCRYPTED_NOTE_SIZE];

        let mut index = 0;

        bytes_to_encrypt[..SCALAR_SIZE].clone_from_slice(self.randomness.to_repr().as_ref());
        index += SCALAR_SIZE;

        LittleEndian::write_u64_into(
            &[self.value],
            &mut bytes_to_encrypt[index..(index + AMOUNT_VALUE_SIZE)],
        );
        index += AMOUNT_VALUE_SIZE;

        bytes_to_encrypt[index..(index + MEMO_SIZE)].copy_from_slice(&self.memo.0[..]);
        index += MEMO_SIZE;

        bytes_to_encrypt[index..(index + ASSET_ID_LENGTH)]
            .copy_from_slice(self.asset_id.as_bytes());
        index += ASSET_ID_LENGTH;

        bytes_to_encrypt[index..].copy_from_slice(&self.sender.public_address());

        aead::encrypt(shared_secret, &bytes_to_encrypt).unwrap()
    }

    /// Computes the note commitment, returning the full point.
    fn commitment_full_point(&self) -> SubgroupPoint {
        commitment_full_point(
            self.asset_generator(),
            self.value,
            self.owner.0,
            self.randomness,
            self.sender.0,
        )
    }

    /// Compute the nullifier for this note, given the ViewKey of its owner.
    ///
    /// The nullifier is a series of bytes that is published by the note owner
    /// only at the time the note is spent. This key is collected in a massive
    /// 'nullifier set', preventing double-spend.
    pub fn nullifier(&self, view_key: &ViewKey, position: u64) -> Nullifier {
        // Compute rho = cm + position.G
        let rho = self.commitment_full_point()
            + (*NULLIFIER_POSITION_GENERATOR * ironfish_jubjub::Fr::from(position));

        // Compute nf = BLAKE2s(nk | rho)
        Nullifier::from_slice(
            Blake2sParams::new()
                .hash_length(32)
                .personal(PRF_NF_PERSONALIZATION)
                .to_state()
                .update(&view_key.nullifier_deriving_key.to_bytes())
                .update(&rho.to_bytes())
                .finalize()
                .as_bytes(),
        )
        .unwrap()
    }

    /// Get the commitment hash for this note. This encapsulates all the values
    /// in the note, including the randomness and converts them to a byte
    /// format. This hash is what gets used for the leaf nodes in a Merkle Tree.
    pub fn commitment(&self) -> [u8; 32] {
        self.commitment_point().to_bytes_le()
    }

    /// Compute the commitment of this note. This is essentially a hash of all
    /// the note values, including randomness.
    ///
    /// The owner can publish this value to commit to the fact that the note
    /// exists, without revealing any of the values on the note until later.
    pub fn commitment_point(&self) -> Scalar {
        // The commitment is in the prime order subgroup, so mapping the
        // commitment to the u-coordinate is an injective encoding.
        ironfish_jubjub::ExtendedPoint::from(self.commitment_full_point())
            .to_affine()
            .get_u()
    }

    /// Verify that the note's commitment matches the one passed in
    pub(crate) fn verify_commitment(&self, commitment: Scalar) -> Result<(), IronfishError> {
        if commitment == self.commitment_point() {
            Ok(())
        } else {
            Err(IronfishError::new(IronfishErrorKind::InvalidCommitment))
        }
    }

    fn decrypt_note_parts(
        shared_secret: &[u8; 32],
        encrypted_bytes: &[u8; ENCRYPTED_NOTE_SIZE + aead::MAC_SIZE],
    ) -> Result<
        (
            ironfish_jubjub::Fr,
            AssetIdentifier,
            u64,
            Memo,
            PublicAddress,
        ),
        IronfishError,
    > {
        let plaintext_bytes: [u8; ENCRYPTED_NOTE_SIZE] =
            aead::decrypt(shared_secret, encrypted_bytes)?;
        let mut reader = &plaintext_bytes[..];

        let randomness = read_scalar(&mut reader)?;
        let value = reader.read_u64::<LittleEndian>()?;

        let mut memo = Memo::default();
        reader.read_exact(&mut memo.0)?;

        let asset_id = AssetIdentifier::read(&mut reader)?;

        let sender = PublicAddress::read(&mut reader)?;
        Ok((randomness, asset_id, value, memo, sender))
    }
}

#[cfg(test)]
mod test {
    use super::{Memo, Note};
    use crate::{
        assets::asset_identifier::NATIVE_ASSET,
        keys::{shared_secret, EphemeralKeyPair, SaplingKey},
    };

    #[test]
    fn test_plaintext_serialization() {
        let owner_key: SaplingKey = SaplingKey::generate_key();
        let public_address = owner_key.public_address();
        let sender_key: SaplingKey = SaplingKey::generate_key();
        let sender_address = sender_key.public_address();
        let note = Note::new(
            public_address,
            42,
            "serialize me",
            NATIVE_ASSET,
            sender_address,
        );
        let mut serialized = Vec::new();
        note.write(&mut serialized)
            .expect("Should serialize cleanly");

        let note2 = Note::read(&serialized[..]).expect("It should deserialize cleanly");
        assert_eq!(note2.owner.public_address(), note.owner.public_address());
        assert_eq!(note2.value, 42);
        assert_eq!(note2.randomness, note.randomness);
        assert_eq!(note2.memo, note.memo);
        assert_eq!(note2.sender.public_address(), note.sender.public_address());

        let mut serialized2 = Vec::new();
        note2
            .write(&mut serialized2)
            .expect("Should still serialize cleanly");
        assert_eq!(serialized, serialized2)
    }

    #[test]
    fn test_note_encryption() {
        let owner_key: SaplingKey = SaplingKey::generate_key();
        let public_address = owner_key.public_address();
        let sender_key: SaplingKey = SaplingKey::generate_key();
        let sender_address = sender_key.public_address();

        let diffie_hellman_keys = EphemeralKeyPair::new();
        let dh_secret = diffie_hellman_keys.secret();
        let dh_public = diffie_hellman_keys.public();

        let public_shared_secret = shared_secret(dh_secret, &public_address.0, dh_public);
        let note = Note::new(public_address, 42, "", NATIVE_ASSET, sender_address);
        let encryption_result = note.encrypt(&public_shared_secret);

        let private_shared_secret = owner_key.incoming_view_key().shared_secret(dh_public);
        assert_eq!(private_shared_secret, public_shared_secret);

        let restored_note = Note::from_owner_encrypted(
            owner_key.incoming_view_key(),
            &private_shared_secret,
            &encryption_result,
        )
        .expect("Should be able to decrypt bytes");
        assert!(
            restored_note.owner.public_address().as_ref() == note.owner.public_address().as_ref()
        );
        assert!(note.value == restored_note.value);
        assert!(note.randomness == restored_note.randomness);
        assert!(note.memo == restored_note.memo);
        assert_eq!(
            restored_note.sender.public_address(),
            note.sender.public_address()
        );

        let spender_decrypted =
            Note::from_spender_encrypted(note.owner.0, &public_shared_secret, &encryption_result)
                .expect("Should be able to load from transmission key");
        assert!(
            spender_decrypted.owner.public_address().as_ref()
                == note.owner.public_address().as_ref()
        );
        assert!(note.value == spender_decrypted.value);
        assert!(note.randomness == spender_decrypted.randomness);
        assert!(note.memo == spender_decrypted.memo);
        assert_eq!(
            spender_decrypted.sender.public_address(),
            note.sender.public_address()
        );
    }

    #[test]
    fn construct_memo_from_string() {
        let memo = Memo::from("a memo");
        assert_eq!(&memo.0[..6], b"a memo");
        let string = "a memo".to_string();
        let memo = Memo::from(&*string);
        assert_eq!(&memo.0[..6], b"a memo");
        let memo = Memo::from(string);
        assert_eq!(&memo.0[..6], b"a memo");
    }
}
