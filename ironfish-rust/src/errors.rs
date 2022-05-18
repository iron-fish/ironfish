/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use std::error::Error;
use std::fmt;
use std::io;

use bellman::SynthesisError;

/// Error raised if constructing a sapling key fails for any reason.
#[derive(Debug)]
pub enum SaplingKeyError {
    IOError,
    FieldDecodingError,
    InvalidViewingKey,
    InvalidPaymentAddress,
    InvalidPublicAddress,
    DiversificationError,
    InvalidLanguageEncoding,
    InvalidWord,
}

impl fmt::Display for SaplingKeyError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{:?}", self)
    }
}

impl Error for SaplingKeyError {}

impl From<io::Error> for SaplingKeyError {
    fn from(_e: io::Error) -> SaplingKeyError {
        SaplingKeyError::IOError
    }
}

/// Error raised if proving fails for some reason
#[derive(Debug)]
pub enum SaplingProofError {
    SpendCircuitProofError(String),
    ReceiptCircuitProofError,
    SaplingKeyError,
    IOError,
    SigningError,
    VerificationFailed,
    InconsistentWitness,
}

impl fmt::Display for SaplingProofError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{:?}", self)
    }
}

impl Error for SaplingProofError {}

impl From<SaplingKeyError> for SaplingProofError {
    fn from(_e: SaplingKeyError) -> SaplingProofError {
        SaplingProofError::SaplingKeyError
    }
}

impl From<SynthesisError> for SaplingProofError {
    fn from(e: SynthesisError) -> SaplingProofError {
        SaplingProofError::SpendCircuitProofError(e.to_string())
    }
}

impl From<io::Error> for SaplingProofError {
    fn from(_e: io::Error) -> SaplingProofError {
        SaplingProofError::IOError
    }
}

/// Errors raised when constructing a transaction
#[derive(Debug)]
pub enum TransactionError {
    InvalidBalanceError,
    IllegalValueError,
    SigningError,
    ProvingError,
    IoError(io::Error),
    VerificationFailed,
}

impl fmt::Display for TransactionError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{:?}", self)
    }
}

impl Error for TransactionError {}

impl From<SaplingProofError> for TransactionError {
    fn from(e: SaplingProofError) -> TransactionError {
        match e {
            SaplingProofError::SigningError => TransactionError::SigningError,
            SaplingProofError::VerificationFailed => TransactionError::VerificationFailed,
            _ => TransactionError::ProvingError,
        }
    }
}

impl From<io::Error> for TransactionError {
    fn from(e: io::Error) -> TransactionError {
        TransactionError::IoError(e)
    }
}

/// Errors raised when constructing a note
#[derive(Debug)]
pub enum NoteError {
    IoError,
    RandomnessError,
    KeyError,
    InvalidCommitment,
}

impl fmt::Display for NoteError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{:?}", self)
    }
}

impl Error for NoteError {}

impl From<io::Error> for NoteError {
    fn from(_e: io::Error) -> NoteError {
        NoteError::IoError
    }
}

impl From<SaplingKeyError> for NoteError {
    fn from(_e: SaplingKeyError) -> NoteError {
        NoteError::KeyError
    }
}

/// Errors raised when creating an asset
#[derive(Debug)]
pub enum AssetError {
    RandomnessError,
}

impl fmt::Display for AssetError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{:?}", self)
    }
}

impl Error for AssetError {}
