/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use super::{
    errors,
    keys::{IncomingViewKey, PublicAddress, SaplingKey},
    nullifiers::Nullifier,
    serializing::{aead, read_scalar, scalar_to_bytes},
    Sapling,
};
use byteorder::{ByteOrder, LittleEndian, ReadBytesExt, WriteBytesExt};
use ff::PrimeField;
use rand::{thread_rng, Rng};
use zcash_primitives::primitives::Note as SaplingNote;

use std::{fmt, io, io::Read, sync::Arc};
use zcash_primitives::jubjub::{edwards, JubjubEngine, PrimeOrder, ToUniform};

pub const ENCRYPTED_NOTE_SIZE: usize = 83;

/// Memo field on a Note. Used to encode transaction IDs or other information
/// about the transaction.
#[derive(Shrinkwrap, Debug, Clone, Copy, PartialEq)]
pub struct Memo(pub [u8; 32]);

impl From<&str> for Memo {
    fn from(string: &str) -> Self {
        let memo_as_bytes = string.as_bytes();
        let num_to_clone = std::cmp::min(memo_as_bytes.len(), 32);
        let mut memo_bytes = [0; 32];
        memo_bytes[..num_to_clone].clone_from_slice(&memo_as_bytes[..num_to_clone]);
        Memo(memo_bytes)
    }
}

impl From<String> for Memo {
    fn from(string: String) -> Self {
        Memo::from(string.as_str())
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
#[derive(Clone)]
pub struct Note<J: JubjubEngine + pairing::MultiMillerLoop> {
    pub(crate) sapling: Arc<Sapling<J>>,
    /// A public address for the owner of the note. One owner can have multiple public addresses,
    /// each associated with a different diversifier.
    pub(crate) owner: PublicAddress<J>,

    /// Value this note represents.
    pub(crate) value: u64,

    /// A random value generated when the note is constructed.
    /// This helps create zero knowledge around the note,
    /// allowing the owner to prove they have the note without revealing
    /// anything else about it.
    pub(crate) randomness: J::Fs,

    /// Arbitrary note the spender can supply when constructing a spend so the
    /// receiver has some record from whence it came.
    /// Note: While this is encrypted with the output, it is not encoded into
    /// the proof in any way.
    pub(crate) memo: Memo,
}

impl<'a, J: JubjubEngine + pairing::MultiMillerLoop> Note<J> {
    /// Construct a new Note.
    pub fn new(sapling: Arc<Sapling<J>>, owner: PublicAddress<J>, value: u64, memo: Memo) -> Self {
        let mut buffer = [0u8; 64];
        thread_rng().fill(&mut buffer[..]);

        let randomness: J::Fs = J::Fs::to_uniform(&buffer[..]);

        Self {
            sapling,
            owner,
            value,
            randomness,
            memo,
        }
    }

    /// Read a note from the given stream IN PLAINTEXT.
    ///
    /// You probably don't want to use this unless you are transmitting
    /// across nodejs threads in memory.
    pub fn read<R: io::Read>(
        mut reader: R,
        sapling: Arc<Sapling<J>>,
    ) -> Result<Self, errors::SaplingKeyError> {
        let owner = PublicAddress::read(sapling.clone(), &mut reader)?;
        let value = reader.read_u64::<LittleEndian>()?;
        let randomness: J::Fs = read_scalar(&mut reader)?;

        let mut memo_vec = vec![];
        let mut memo = Memo([0; 32]);
        reader.read_to_end(&mut memo_vec)?;
        assert_eq!(memo_vec.len(), 32);
        memo.0.copy_from_slice(&memo_vec[..]);

        Ok(Self {
            sapling,
            owner,
            value,
            randomness,
            memo,
        })
    }

    /// Write the note to the given stream IN PLAINTEXT.
    ///
    /// This should generally never be used to serialize to disk or the network.
    /// It is primarily added as a device for transmitting the note across
    /// thread boundaries.
    pub fn write<W: io::Write>(&self, mut writer: &mut W) -> io::Result<()> {
        self.owner.write(&mut writer)?;
        writer.write_u64::<LittleEndian>(self.value)?;
        writer.write_all(self.randomness.to_repr().as_ref())?;
        writer.write_all(&self.memo.0)?;
        Ok(())
    }

    /// Create a note from its encrypted representation, given the owner's
    /// view key.
    ///
    /// The note is stored on the ReceiptProof in encrypted form. The spender
    /// encrypts it when they construct the receipt using a shared secret
    /// derived from the owner's public key.
    ///
    /// This function allows the owner to decrypt the note using the derived
    /// shared secret and their own view key.
    pub fn from_owner_encrypted(
        owner_view_key: &'a IncomingViewKey<J>,
        shared_secret: &[u8; 32],
        encrypted_bytes: &[u8; ENCRYPTED_NOTE_SIZE + aead::MAC_SIZE],
    ) -> Result<Self, errors::NoteError> {
        let (diversifier_bytes, randomness, value, memo) =
            Note::<J>::decrypt_note_parts(shared_secret, encrypted_bytes)?;
        let owner = owner_view_key.public_address(&diversifier_bytes)?;

        Ok(Note {
            sapling: owner_view_key.sapling.clone(),
            owner,
            value,
            randomness,
            memo,
        })
    }

    /// Create a note from its encrypted representation, given the spender's
    /// view key.
    ///
    /// The note is stored on the ReceiptProof in encrypted form. The spender
    /// encrypts it when they construct the receipt using a shared secret
    /// derived from the owner's public key.
    ///
    /// This function allows the owner to decrypt the note using the derived
    /// shared secret and their own view key.
    pub(crate) fn from_spender_encrypted(
        sapling: Arc<Sapling<J>>,
        transmission_key: edwards::Point<J, PrimeOrder>,
        shared_secret: &[u8; 32],
        encrypted_bytes: &[u8; ENCRYPTED_NOTE_SIZE + aead::MAC_SIZE],
    ) -> Result<Self, errors::NoteError> {
        let (diversifier_bytes, randomness, value, memo) =
            Note::<J>::decrypt_note_parts(shared_secret, encrypted_bytes)?;
        let (diversifier, diversifier_point) =
            PublicAddress::load_diversifier(&sapling.jubjub, &diversifier_bytes[..])?;
        let owner = PublicAddress {
            diversifier,
            diversifier_point,
            transmission_key,
        };

        Ok(Note {
            sapling,
            owner,
            value,
            randomness,
            memo,
        })
    }

    pub fn value(&self) -> u64 {
        self.value
    }

    pub fn memo(&self) -> Memo {
        self.memo
    }

    pub fn owner(&self) -> PublicAddress<J> {
        self.owner.clone()
    }

    /// Send encrypted form of the note, which is what gets publicly stored on
    /// the tree. Only someone with the incoming viewing key for the note can
    /// actually read the contents.
    pub fn encrypt(&self, shared_secret: &[u8; 32]) -> [u8; ENCRYPTED_NOTE_SIZE + aead::MAC_SIZE] {
        let mut bytes_to_encrypt = [0; ENCRYPTED_NOTE_SIZE];
        bytes_to_encrypt[..11].copy_from_slice(&self.owner.diversifier.0[..]);
        bytes_to_encrypt[11..43].clone_from_slice(self.randomness.to_repr().as_ref());

        LittleEndian::write_u64_into(&[self.value], &mut bytes_to_encrypt[43..51]);
        bytes_to_encrypt[51..].copy_from_slice(&self.memo[..]);
        let mut encrypted_bytes = [0; ENCRYPTED_NOTE_SIZE + aead::MAC_SIZE];
        aead::encrypt(shared_secret, &bytes_to_encrypt, &mut encrypted_bytes);

        encrypted_bytes
    }

    /// Compute the nullifier for this note, given the private key of its owner.
    ///
    /// The nullifier is a series of bytes that is published by the note owner
    /// only at the time the note is spent. This key is collected in a massive
    /// 'nullifier set', preventing double-spend.
    pub fn nullifier(&self, private_key: &SaplingKey<J>, position: u64) -> Nullifier {
        let mut result = [0; 32];
        let result_as_vec = self.sapling_note().nf(
            &private_key.sapling_viewing_key(),
            position,
            &self.sapling.jubjub,
        );
        assert_eq!(result_as_vec.len(), 32);
        result[0..32].copy_from_slice(&result_as_vec[0..32]);
        result
    }

    /// Get the commitment hash for this note. This encapsulates all the values
    /// in the note, including the randomness and converts them to a byte
    /// format. This hash is what gets used for the leaf nodes in a Merkle Tree.
    pub fn commitment(&self) -> [u8; 32] {
        scalar_to_bytes(&self.commitment_point())
    }

    /// Compute the commitment of this note. This is essentially a hash of all
    /// the note values, including randomness.
    ///
    /// The owner can publish this value to commit to the fact that the note
    /// exists, without revealing any of the values on the note until later.
    pub(crate) fn commitment_point(&self) -> J::Fr {
        self.sapling_note().cm(&self.sapling.jubjub)
    }

    /// Verify that the note's commitment matches the one passed in
    pub(crate) fn verify_commitment(&self, commitment: J::Fr) -> Result<(), errors::NoteError> {
        if commitment == self.commitment_point() {
            Ok(())
        } else {
            Err(errors::NoteError::InvalidCommitment)
        }
    }

    fn decrypt_note_parts(
        shared_secret: &[u8; 32],
        encrypted_bytes: &[u8; ENCRYPTED_NOTE_SIZE + aead::MAC_SIZE],
    ) -> Result<([u8; 11], J::Fs, u64, Memo), errors::NoteError> {
        let mut plaintext_bytes = [0; ENCRYPTED_NOTE_SIZE];
        aead::decrypt(shared_secret, encrypted_bytes, &mut plaintext_bytes)?;

        let mut reader = plaintext_bytes[..].as_ref();
        let mut diversifier_bytes = [0; 11];
        reader.read_exact(&mut diversifier_bytes[..])?;

        let randomness: J::Fs = read_scalar(&mut reader)?;
        let value = reader.read_u64::<LittleEndian>()?;
        let mut memo_vec = vec![];
        let mut memo = Memo([0; 32]);
        reader.read_to_end(&mut memo_vec)?;
        assert_eq!(memo_vec.len(), 32);
        memo.0.copy_from_slice(&memo_vec[..]);
        Ok((diversifier_bytes, randomness, value, memo))
    }

    /// The zcash_primitives version of the Note API is kind of klunky with
    /// annoying variable names and exposed values, but it contains the methods
    /// used to calculate nullifier and commitment.
    ///
    /// This is somewhat suboptimal with extra calculations and bytes being
    /// passed around. I'm not worried about it yet, since only notes actively
    /// being spent have to create these.
    fn sapling_note(&self) -> SaplingNote<J> {
        SaplingNote {
            value: self.value,
            g_d: self.owner.diversifier.g_d(&self.sapling.jubjub).unwrap(),
            pk_d: self.owner.transmission_key.clone(),
            r: self.randomness,
        }
    }
}

#[cfg(test)]
mod test {
    use super::{Memo, Note};
    use crate::{
        keys::{shared_secret, SaplingKey},
        sapling_bls12,
    };
    use pairing::bls12_381::Bls12;

    #[test]
    fn test_plaintext_serialization() {
        let sapling = &*sapling_bls12::SAPLING;
        let owner_key: SaplingKey<Bls12> = SaplingKey::generate_key(sapling.clone());
        let public_address = owner_key.generate_public_address();
        let note = Note::new(sapling.clone(), public_address, 42, "serialize me".into());
        let mut serialized = Vec::new();
        note.write(&mut serialized)
            .expect("Should serialize cleanly");

        let note2 =
            Note::read(&serialized[..], sapling.clone()).expect("It should deserialize cleanly");
        assert_eq!(note2.owner.public_address(), note.owner.public_address());
        assert_eq!(note2.value, 42);
        assert_eq!(note2.randomness, note.randomness);
        assert_eq!(note2.memo, note.memo);

        let mut serialized2 = Vec::new();
        note2
            .write(&mut serialized2)
            .expect("Should still serialize cleanly");
        assert_eq!(serialized, serialized2)
    }

    #[test]
    fn test_note_encryption() {
        let sapling = &*sapling_bls12::SAPLING;
        let owner_key: SaplingKey<Bls12> = SaplingKey::generate_key(sapling.clone());
        let public_address = owner_key.generate_public_address();
        let (dh_secret, dh_public) = public_address.generate_diffie_hellman_keys(&sapling.jubjub);
        let public_shared_secret = shared_secret(
            &sapling.jubjub,
            &dh_secret,
            &public_address.transmission_key,
            &dh_public,
        );
        let note = Note::new(sapling.clone(), public_address, 42, Memo([0; 32]));
        let encryption_result = note.encrypt(&public_shared_secret);

        let private_shared_secret = owner_key.incoming_view_key().shared_secret(&dh_public);
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

        let spender_decrypted = Note::from_spender_encrypted(
            sapling.clone(),
            note.owner.transmission_key.clone(),
            &public_shared_secret,
            &encryption_result,
        )
        .expect("Should be able to load from transmission key");
        assert!(
            spender_decrypted.owner.public_address().as_ref()
                == note.owner.public_address().as_ref()
        );
        assert!(note.value == spender_decrypted.value);
        assert!(note.randomness == spender_decrypted.randomness);
        assert!(note.memo == spender_decrypted.memo);
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
