use bls12_381::Scalar;
use zcash_primitives::primitives::Nullifier;

use crate::{primitives::sapling::ValueCommitment, AssetType, PublicAddress, SaplingKey};

/// transaction.spend needs:
///  (Look in SpendParams::new and transaction.add_spend_proof)
/// note.commitment_point()
///     - used for witness.verify
/// note.value
///     - used for value commitment - can the value commitment be encapsulated better?
///     - i feel like we shouldnt need to create a randomness to call it.
///         maybe optional if it IS needed in some scenarios
///         otherwise can probably just do it in the asset_type.value_commitment fn
/// note.asset_type
///     used for Spend circuit
///     used for value commitment, see above
///     maybe we need a note.value_commitment()
/// note.owner
///     used for note.owner.sapling_payment_address()
/// note.randomness
///     used for Spend circuit
/// note.nullifier
///     used for spend params

pub enum NoteType {
    Spend,
    Output,
    CreateAsset,
    MintAsset,
}

pub trait SpendableNote {
    fn nullifier(&self, spender_key: &SaplingKey, witness_position: u64) -> Nullifier;
    // TODO: I think this makes sense here, but confirm
    fn value_commitment(&self) -> ValueCommitment;
    fn value(&self) -> u64;
}

// TODO: Just named NoteTrait to avoid name collision with existing note If we
// do this, we should just rename this to Note and rename the struct to
// something else
pub trait NoteTrait {
    fn note_type(&self) -> NoteType;
    fn commitment_point(&self) -> Scalar;
    fn asset_type(&self) -> AssetType;
    fn owner(&self) -> PublicAddress;
    fn randomness(&self) -> jubjub::Fr;
    // Possibly split this into a different trait?
    // fn encrypt(&self) -> ();
    // fn decrypt() -> ();
    // These should definitely be a common trait beyond even just notes.
    // transactions use these as well etc
    // fn read(&self) -> ();
    // fn write(&self) -> ();
}
