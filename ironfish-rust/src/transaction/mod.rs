/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use super::{
    errors::{SaplingProofError, TransactionError},
    keys::{PublicAddress, SaplingKey},
    merkle_note::NOTE_ENCRYPTION_MINER_KEYS,
    note::{Memo, Note},
    receiving::{ReceiptParams, ReceiptProof},
    spending::{SpendParams, SpendProof},
    witness::WitnessTrait,
    Sapling,
};
use blake2b_simd::Params as Blake2b;
use byteorder::{LittleEndian, ReadBytesExt, WriteBytesExt};
use ff::Field;
use rand::rngs::OsRng;

use zcash_primitives::redjubjub::{PrivateKey, PublicKey, Signature};

use std::{io, slice::Iter, sync::Arc};
use zcash_primitives::jubjub::{edwards, FixedGenerators, JubjubEngine, JubjubParams, Unknown};

use std::ops::AddAssign;
use std::ops::SubAssign;

#[cfg(test)]
mod tests;

const SIGNATURE_HASH_PERSONALIZATION: &[u8; 8] = b"Bnsighsh";
const TRANSACTION_SIGNATURE_VERSION: &[u8; 1] = &[0];

/// A collection of spend and receipt proofs that can be signed and verified.
/// In general, all the spent values should add up to all the receipt values.
///
/// The Transaction is used while the spends and receipts are being constructed,
/// and contains working state that is used to create the transaction information.
///
/// The Transaction, below, contains the serializable version, without any
/// secret keys or state not needed for verifying.
pub struct ProposedTransaction<J: JubjubEngine + pairing::MultiMillerLoop> {
    /// Essentially a global reference to the sapling parameters, including
    /// proving and verification keys.
    sapling: Arc<Sapling<J>>,

    /// A "private key" manufactured from a bunch of randomness added for each
    /// spend and output.
    binding_signature_key: J::Fs,

    /// A "public key" manufactured from a combination of the values of each
    /// transaction and the same randomness as above
    binding_verification_key: edwards::Point<J, Unknown>,

    /// Proofs of the individual spends with all values required to calculate
    /// the signatures.
    spends: Vec<SpendParams<J>>,

    /// proofs of the individual receipts with values required to calculate
    /// signatures. Note: This is commonly referred to as
    /// `outputs` in the literature.
    receipts: Vec<ReceiptParams<J>>,

    /// The balance of all the spends minus all the receipts. The difference
    /// is the fee paid to the miner for mining the transaction.
    transaction_fee: i64,

    /// This is the sequence in the chain the transaction will expire at and be
    /// removed from the mempool. A value of 0 indicates the transaction will
    /// not expire.
    expiration_sequence: u32,
    //
    // NOTE: If adding fields here, you may need to add fields to
    // signature hash method, and also to Transaction.
}

impl<J: JubjubEngine + pairing::MultiMillerLoop> ProposedTransaction<J> {
    pub fn new(sapling: Arc<Sapling<J>>) -> ProposedTransaction<J> {
        ProposedTransaction {
            sapling,
            binding_signature_key: <J::Fs as Field>::zero(),
            binding_verification_key: edwards::Point::zero(),
            spends: vec![],
            receipts: vec![],
            transaction_fee: 0,
            expiration_sequence: 0,
        }
    }

    /// Spend the note owned by spender_key at the given witness location.
    pub fn spend(
        &mut self,
        spender_key: SaplingKey<J>,
        note: &Note<J>,
        witness: &dyn WitnessTrait<J>,
    ) -> Result<(), SaplingProofError> {
        let proof = SpendParams::new(self.sapling.clone(), spender_key, note, witness)?;
        self.add_spend_proof(proof, note.value());
        Ok(())
    }

    /// Add a spend proof that was created externally.
    ///
    /// This allows for parallel immutable spends without having to take
    /// a mutable pointer out on self.
    pub fn add_spend_proof(&mut self, spend: SpendParams<J>, note_value: u64) {
        self.increment_binding_signature_key(&spend.value_commitment.randomness, false);
        self.increment_binding_verification_key(&spend.value_commitment(), false);

        self.spends.push(spend);
        self.transaction_fee += note_value as i64;
    }

    /// Create a proof of a new note owned by the recipient in this
    /// transaction.
    pub fn receive(
        &mut self,
        spender_key: &SaplingKey<J>,
        note: &Note<J>,
    ) -> Result<(), SaplingProofError> {
        let proof = ReceiptParams::new(self.sapling.clone(), spender_key, note)?;

        self.increment_binding_signature_key(&proof.value_commitment_randomness, true);
        self.increment_binding_verification_key(&proof.merkle_note.value_commitment, true);

        self.receipts.push(proof);
        self.transaction_fee -= note.value as i64;

        Ok(())
    }

    /// Post the transaction. This performs a bit of validation, and signs
    /// the spends with a signature that proves the spends are part of this
    /// transaction.
    ///
    /// Transaction fee is the amount the spender wants to send to the miner
    /// for mining this transaction. This has to be non-negative; sane miners
    /// wouldn't accept a transaction that takes money away from them.
    ///
    /// sum(spends) - sum(outputs) - intended_transaction_fee - change = 0
    /// aka: self.transaction_fee - intended_transaction_fee - change = 0
    pub fn post(
        &mut self,
        spender_key: &SaplingKey<J>,
        change_goes_to: Option<PublicAddress<J>>,
        intended_transaction_fee: u64,
    ) -> Result<Transaction<J>, TransactionError> {
        let change_amount = self.transaction_fee - intended_transaction_fee as i64;

        if change_amount < 0 {
            return Err(TransactionError::InvalidBalanceError);
        }
        if change_amount > 0 {
            // TODO: The public address generated from the spender_key if
            // change_goes_to is None should probably be associated with a
            // known diversifier (eg: that used on other notes?)
            // But we haven't worked out why determinacy in public addresses
            // would be useful yet.
            let change_address =
                change_goes_to.unwrap_or_else(|| spender_key.generate_public_address());
            let change_note = Note::new(
                self.sapling.clone(),
                change_address,
                change_amount as u64, // we checked it was positive
                Memo([0; 32]),
            );
            self.receive(spender_key, &change_note)?;
        }
        self._partial_post()
    }

    /// Special case for posting a miners fee transaction. Miner fee transactions
    /// are unique in that they generate currency. They do not have any spends
    /// or change and therefore have a negative transaction fee. In normal use,
    /// a miner would not accept such a transaction unless it was explicitly set
    /// as the miners fee.
    pub fn post_miners_fee(&mut self) -> Result<Transaction<J>, TransactionError> {
        if !self.spends.is_empty() || self.receipts.len() != 1 {
            return Err(TransactionError::InvalidBalanceError);
        }
        // Ensure the merkle note has an identifiable encryption key
        self.receipts
            .get_mut(0)
            .expect("bounds checked above")
            .merkle_note
            .note_encryption_keys = *NOTE_ENCRYPTION_MINER_KEYS;
        self._partial_post()
    }
    /// Super special case for generating an illegal transaction for the genesis block.
    /// Don't bother using this anywhere else, it won't pass verification.
    #[deprecated(note = "Use only in genesis block generation")]
    pub fn post_genesis_transaction(&self) -> Result<Transaction<J>, TransactionError> {
        self._partial_post()
    }

    /// Get the expiration sequence for this transaction
    pub fn expiration_sequence(&self) -> u32 {
        self.expiration_sequence
    }

    /// Set the sequence to expire the transaction from the mempool.
    pub fn set_expiration_sequence(&mut self, expiration_sequence: u32) {
        self.expiration_sequence = expiration_sequence;
    }

    // post transaction without much validation.
    fn _partial_post(&self) -> Result<Transaction<J>, TransactionError> {
        self.check_value_consistency()?;
        let data_to_sign = self.transaction_signature_hash();
        let binding_signature = self.binding_signature()?;
        let mut spend_proofs = vec![];
        for spend in &self.spends {
            spend_proofs.push(spend.post(&data_to_sign)?);
        }
        let mut receipt_proofs = vec![];
        for receipt in &self.receipts {
            receipt_proofs.push(receipt.post()?);
        }
        Ok(Transaction {
            sapling: self.sapling.clone(),
            expiration_sequence: self.expiration_sequence,
            transaction_fee: self.transaction_fee,
            spends: spend_proofs,
            receipts: receipt_proofs,
            binding_signature,
        })
    }

    /// Calculate a hash of the transaction data. This hash is what gets signed
    /// by the private keys to verify that the transaction actually happened.
    ///
    /// This is called during final posting of the transaction
    ///
    fn transaction_signature_hash(&self) -> [u8; 32] {
        let mut hasher = Blake2b::new()
            .hash_length(32)
            .personal(SIGNATURE_HASH_PERSONALIZATION)
            .to_state();

        hasher.update(TRANSACTION_SIGNATURE_VERSION);
        hasher
            .write_u32::<LittleEndian>(self.expiration_sequence)
            .unwrap();
        hasher
            .write_i64::<LittleEndian>(self.transaction_fee)
            .unwrap();
        for spend in self.spends.iter() {
            spend.serialize_signature_fields(&mut hasher).unwrap();
        }
        for receipt in self.receipts.iter() {
            receipt.serialize_signature_fields(&mut hasher).unwrap();
        }

        let mut hash_result = [0; 32];
        hash_result[..].clone_from_slice(hasher.finalize().as_ref());
        hash_result
    }

    /// Confirm that balance of input and receipt values is consistent with
    /// those used in the proofs.
    ///
    /// Does not confirm that the transactions add up to zero. The calculation
    /// for fees and change happens elsewhere.
    ///
    /// Can be safely called after each spend or receipt is added.
    ///
    /// Note: There is some duplication of effort between this function and
    /// binding_signature below. I find the separation of concerns easier
    /// to read, but it's an easy win if we see a performance bottleneck here.
    fn check_value_consistency(&self) -> Result<(), TransactionError> {
        let jubjub = &self.sapling.jubjub;
        let private_key = PrivateKey::<J>(self.binding_signature_key);
        let public_key = PublicKey::from_private(
            &private_key,
            FixedGenerators::ValueCommitmentRandomness,
            jubjub,
        );
        let mut value_balance_point = value_balance_to_point(self.transaction_fee as i64, jubjub)?;

        value_balance_point = value_balance_point.negate();
        let mut calculated_public_key = self.binding_verification_key.clone();
        calculated_public_key = calculated_public_key.add(&value_balance_point, jubjub);

        if calculated_public_key != public_key.0 {
            Err(TransactionError::InvalidBalanceError)
        } else {
            Ok(())
        }
    }

    /// The binding signature ties up all the randomness generated with the
    /// transaction and uses it as a private key to sign all the values
    /// that were calculated as part of the transaction. This function
    /// performs the calculation and sets the value on this struct.
    fn binding_signature(&self) -> Result<Signature, TransactionError> {
        let mut data_to_be_signed = [0u8; 64];
        let private_key = PrivateKey::<J>(self.binding_signature_key);
        let public_key = PublicKey::from_private(
            &private_key,
            FixedGenerators::ValueCommitmentRandomness,
            &self.sapling.jubjub,
        );

        public_key
            .0
            .write(&mut data_to_be_signed[..32])
            .expect("Should be able to copy key");
        (&mut data_to_be_signed[32..]).copy_from_slice(&self.transaction_signature_hash());

        Ok(private_key.sign(
            &data_to_be_signed,
            &mut OsRng,
            FixedGenerators::ValueCommitmentRandomness,
            &self.sapling.jubjub,
        ))
    }

    /// Helper method to encapsulate the verbose way incrementing the signature
    /// key works
    fn increment_binding_signature_key(&mut self, value: &J::Fs, negate: bool) {
        let tmp = *value;
        if negate {
            //binding_signature_key - value
            self.binding_signature_key.sub_assign(&tmp);
        } else {
            //binding_signature_key + value
            self.binding_signature_key.add_assign(&tmp);
        }
    }

    /// Helper method to encapsulate the verboseness around incrementing the
    /// binding verificaiton key
    fn increment_binding_verification_key(
        &mut self,
        value: &edwards::Point<J, Unknown>,
        negate: bool,
    ) {
        let mut tmp = value.clone();
        if negate {
            tmp = tmp.negate();
        }
        tmp = tmp.add(&self.binding_verification_key, &self.sapling.jubjub);
        self.binding_verification_key = tmp;
    }
}

/// A transaction that has been published and can be read by anyone, not storing
/// any of the working data or private keys used in creating the proofs.
///
/// This is the serializable form of a transaction.
#[derive(Clone)]
pub struct Transaction<J: JubjubEngine + pairing::MultiMillerLoop> {
    /// reference to the sapling object associated with this transaction
    sapling: Arc<Sapling<J>>,

    /// The balance of total spends - outputs, which is the amount that the miner gets to keep
    transaction_fee: i64,

    /// List of spends, or input notes, that have been destroyed.
    spends: Vec<SpendProof<J>>,

    /// List of receipts, or output notes that have been created.
    receipts: Vec<ReceiptProof<J>>,

    /// Signature calculated from accumulating randomness with all the spends
    /// and receipts when the transaction was created.
    binding_signature: Signature,

    /// This is the sequence in the chain the transaction will expire at and be
    /// removed from the mempool. A value of 0 indicates the transaction will
    /// not expire.
    expiration_sequence: u32,
}

impl<J: JubjubEngine + pairing::MultiMillerLoop> Transaction<J> {
    /// Load a Transaction from a Read implementation (e.g: socket, file)
    /// This is the main entry-point when reconstructing a serialized transaction
    /// for verifying.
    pub fn read<R: io::Read>(
        sapling: Arc<Sapling<J>>,
        mut reader: R,
    ) -> Result<Self, TransactionError> {
        let num_spends = reader.read_u64::<LittleEndian>()?;
        let num_receipts = reader.read_u64::<LittleEndian>()?;
        let transaction_fee = reader.read_i64::<LittleEndian>()?;
        let expiration_sequence = reader.read_u32::<LittleEndian>()?;
        let mut spends = vec![];
        let mut receipts = vec![];
        for _ in 0..num_spends {
            spends.push(SpendProof::read(&sapling.jubjub, &mut reader)?);
        }
        for _ in 0..num_receipts {
            receipts.push(ReceiptProof::read(sapling.clone(), &mut reader)?);
        }
        let binding_signature = Signature::read(&mut reader)?;

        Ok(Transaction {
            sapling,
            transaction_fee,
            spends,
            receipts,
            binding_signature,
            expiration_sequence,
        })
    }

    /// Store the bytes of this transaction in the given writer. This is used
    /// to serialize transactions to file or network
    pub fn write<W: io::Write>(&self, mut writer: W) -> io::Result<()> {
        writer.write_u64::<LittleEndian>(self.spends.len() as u64)?;
        writer.write_u64::<LittleEndian>(self.receipts.len() as u64)?;
        writer.write_i64::<LittleEndian>(self.transaction_fee)?;
        writer.write_u32::<LittleEndian>(self.expiration_sequence)?;
        for spend in self.spends.iter() {
            spend.write(&mut writer)?;
        }
        for receipt in self.receipts.iter() {
            receipt.write(&mut writer)?;
        }
        self.binding_signature.write(&mut writer)?;

        Ok(())
    }

    /// Validate the transaction. Confirms that:
    ///  *  Each of the spend proofs has the inputs it says it does
    ///  *  Each of the receipt proofs has the inputs it says it has
    ///  *  Each of the spend proofs was signed by the owner
    ///  *  The entire transaction was signed with a binding signature
    ///     containing those proofs (and only those proofs)
    ///
    pub fn verify(&self) -> Result<(), TransactionError> {
        // Context to accumulate a signature of all the spends and outputs and
        // guarantee they are part of this transaction, unmodified.
        let mut binding_verification_key = edwards::Point::zero();

        for spend in self.spends.iter() {
            spend.verify_proof(&self.sapling)?;
            let mut tmp = spend.value_commitment.clone();
            tmp = tmp.add(&binding_verification_key, &self.sapling.jubjub);
            binding_verification_key = tmp;
        }

        for receipt in self.receipts.iter() {
            receipt.verify_proof(&self.sapling)?;
            let mut tmp = receipt.merkle_note.value_commitment.clone();
            tmp = tmp.negate();
            tmp = tmp.add(&binding_verification_key, &self.sapling.jubjub);
            binding_verification_key = tmp;
        }

        let hash_to_verify_signature = self.transaction_signature_hash();

        for spend in self.spends.iter() {
            spend.verify_signature(&self.sapling.jubjub, &hash_to_verify_signature)?;
        }

        self.verify_binding_signature(&self.sapling, &binding_verification_key)?;

        Ok(())
    }

    /// Get an iterator over the spends in this transaction. Each spend
    /// is by reference
    pub fn iter_spends(&self) -> Iter<SpendProof<J>> {
        self.spends.iter()
    }

    pub fn spends(&self) -> &Vec<SpendProof<J>> {
        &self.spends
    }

    /// Get an iterator over the receipts in this transaction, by reference
    pub fn iter_receipts(&self) -> Iter<ReceiptProof<J>> {
        self.receipts.iter()
    }

    pub fn receipts(&self) -> &Vec<ReceiptProof<J>> {
        &self.receipts
    }

    /// Get the transaction fee for this transaction. Miners should generally
    /// expect this to be positive (or they would lose money mining it!).
    /// The miners_fee transaction would be a special case.
    pub fn transaction_fee(&self) -> i64 {
        self.transaction_fee
    }

    /// Get the transaction signature for this transaction.
    pub fn binding_signature(&self) -> &Signature {
        &self.binding_signature
    }

    /// Get the expiration sequence for this transaction
    pub fn expiration_sequence(&self) -> u32 {
        self.expiration_sequence
    }

    /// Set the sequence to expire the transaction from the mempool.
    pub fn set_expiration_sequence(&mut self, expiration_sequence: u32) {
        self.expiration_sequence = expiration_sequence;
    }

    /// Calculate a hash of the transaction data. This hash was signed by the
    /// private keys when the transaction was constructed, and will now be
    /// reconstructed to verify the signature.
    pub fn transaction_signature_hash(&self) -> [u8; 32] {
        let mut hasher = Blake2b::new()
            .hash_length(32)
            .personal(SIGNATURE_HASH_PERSONALIZATION)
            .to_state();
        hasher.update(TRANSACTION_SIGNATURE_VERSION);
        hasher
            .write_u32::<LittleEndian>(self.expiration_sequence)
            .unwrap();
        hasher
            .write_i64::<LittleEndian>(self.transaction_fee)
            .unwrap();
        for spend in self.spends.iter() {
            spend.serialize_signature_fields(&mut hasher).unwrap();
        }
        for receipt in self.receipts.iter() {
            receipt.serialize_signature_fields(&mut hasher).unwrap();
        }

        let mut hash_result = [0; 32];
        hash_result[..].clone_from_slice(hasher.finalize().as_ref());
        hash_result
    }

    /// Confirm that this transaction was signed by the values it contains.
    /// Called from the public verify function.
    fn verify_binding_signature(
        &self,
        sapling: &Sapling<J>,
        binding_verification_key: &edwards::Point<J, Unknown>,
    ) -> Result<(), TransactionError> {
        let mut value_balance_point =
            value_balance_to_point(self.transaction_fee, &sapling.jubjub)?;
        value_balance_point = value_balance_point.negate();

        let mut public_key_point = binding_verification_key.clone();
        public_key_point = public_key_point.add(&value_balance_point, &sapling.jubjub);
        let public_key = PublicKey(public_key_point);

        let mut data_to_verify_signature = [0; 64];
        public_key
            .0
            .write(&mut data_to_verify_signature[..32])
            .expect("Should be able to copy key");
        (&mut data_to_verify_signature[32..]).copy_from_slice(&self.transaction_signature_hash());

        if !public_key.verify(
            &data_to_verify_signature,
            &self.binding_signature,
            FixedGenerators::ValueCommitmentRandomness,
            &sapling.jubjub,
        ) {
            Err(TransactionError::VerificationFailed)
        } else {
            Ok(())
        }
    }
}

// Convert the integer value to a point on the Jubjub curve, accounting for
// negative values
fn value_balance_to_point<J: JubjubEngine + pairing::MultiMillerLoop>(
    value: i64,
    params: &J::Params,
) -> Result<edwards::Point<J, Unknown>, TransactionError> {
    // Can only construct edwards point on positive numbers, so need to
    // add and possibly negate later
    let is_negative = value.is_negative();
    let abs = match value.checked_abs() {
        Some(a) => a as u64,
        None => return Err(TransactionError::IllegalValueError),
    };

    let mut value_balance = params
        .generator(FixedGenerators::ValueCommitmentValue)
        .mul(J::Fs::from(abs), params);

    if is_negative {
        value_balance = value_balance.negate();
    }

    Ok(value_balance.into())
}
