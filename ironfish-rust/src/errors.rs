/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use std::error::Error;
use std::fmt;
use std::io;
use std::num;
use std::string;

/// Error type to handle all errors within the code and dependency-raised
/// errors. This serves 2 purposes. The first is to keep a consistent error type
/// in the code to reduce the cognitive load needed for using Result and Error
/// types. The second is to give a singular type to convert into NAPI errors to
/// be raised on the Javascript side.
#[derive(Debug)]
pub enum IronfishError {
    BellmanSynthesis(bellman::SynthesisError),
    BellmanVerification(bellman::VerificationError),
    CryptoBox(crypto_box::aead::Error),
    IllegalValue,
    InconsistentWitness,
    InvalidAssetIdentifier,
    InvalidAuthorizingKey,
    InvalidBalance,
    InvalidCommitment,
    InvalidData,
    InvalidDecryptionKey,
    InvalidDiversificationPoint,
    InvalidEntropy,
    InvalidLanguageEncoding,
    InvalidMinersFeeTransaction,
    InvalidMnemonicString,
    InvalidNonceLength,
    InvalidNullifierDerivingKey,
    InvalidPaymentAddress,
    InvalidPublicAddress,
    InvalidSigningKey,
    InvalidTransaction,
    InvalidTransactionVersion,
    InvalidViewingKey,
    InvalidWord,
    Io(io::Error),
    IsSmallOrder,
    RandomnessError,
    TryFromInt(num::TryFromIntError),
    Utf8(string::FromUtf8Error),
    VerificationFailed,
}

impl Error for IronfishError {}

impl fmt::Display for IronfishError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{:?}", self)
    }
}

impl From<io::Error> for IronfishError {
    fn from(e: io::Error) -> IronfishError {
        IronfishError::Io(e)
    }
}

impl From<crypto_box::aead::Error> for IronfishError {
    fn from(e: crypto_box::aead::Error) -> IronfishError {
        IronfishError::CryptoBox(e)
    }
}

impl From<string::FromUtf8Error> for IronfishError {
    fn from(e: string::FromUtf8Error) -> IronfishError {
        IronfishError::Utf8(e)
    }
}

impl From<bellman::VerificationError> for IronfishError {
    fn from(e: bellman::VerificationError) -> IronfishError {
        IronfishError::BellmanVerification(e)
    }
}

impl From<bellman::SynthesisError> for IronfishError {
    fn from(e: bellman::SynthesisError) -> IronfishError {
        IronfishError::BellmanSynthesis(e)
    }
}

impl From<num::TryFromIntError> for IronfishError {
    fn from(e: num::TryFromIntError) -> IronfishError {
        IronfishError::TryFromInt(e)
    }
}
