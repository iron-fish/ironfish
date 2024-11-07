/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use std::backtrace::Backtrace;
use std::backtrace::BacktraceStatus;
use std::error::Error;
use std::fmt;
use std::io;
use std::num;
use std::string;

#[derive(Debug)]
pub struct IronfishError {
    pub kind: IronfishErrorKind,
    pub source: Option<Box<dyn Error>>,
    pub backtrace: Backtrace,
}

/// Error type to handle all errors within the code and dependency-raised
/// errors. This serves 2 purposes. The first is to keep a consistent error type
/// in the code to reduce the cognitive load needed for using Result and Error
/// types. The second is to give a singular type to convert into NAPI errors to
/// be raised on the Javascript side.
#[derive(Debug, PartialEq)]
pub enum IronfishErrorKind {
    BellpersonSynthesis,
    CryptoBox,
    FrostLibError,
    FailedArgon2Hash,
    FailedSignatureAggregation,
    FailedSignatureVerification,
    FailedXChaCha20Poly1305Decryption,
    FailedXChaCha20Poly1305Encryption,
    FailedHkdfExpansion,
    HexError,
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
    InvalidFr,
    InvalidLanguageEncoding,
    InvalidMinersFeeTransaction,
    InvalidMintProof,
    InvalidMintSignature,
    InvalidMnemonicString,
    InvalidNonceLength,
    InvalidNullifierDerivingKey,
    InvalidOutputProof,
    InvalidPaymentAddress,
    InvalidPublicAddress,
    InvalidSecret,
    InvalidRandomizer,
    InvalidSignature,
    InvalidSigningKey,
    InvalidSpendProof,
    InvalidSpendSignature,
    InvalidTransaction,
    InvalidTransactionVersion,
    InvalidViewingKey,
    InvalidWord,
    Io,
    IsSmallOrder,
    RandomnessError,
    RoundTwoSigningFailure,
    TryFromInt,
    Utf8,
}

impl IronfishError {
    pub fn new(kind: IronfishErrorKind) -> Self {
        Self {
            kind,
            source: None,
            backtrace: Backtrace::capture(),
        }
    }

    pub fn new_with_source<E>(kind: IronfishErrorKind, source: E) -> Self
    where
        E: Into<Box<dyn Error>>,
    {
        Self {
            kind,
            source: Some(source.into()),
            backtrace: Backtrace::capture(),
        }
    }
}

impl Error for IronfishError {}

impl fmt::Display for IronfishError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        let has_backtrace = self.backtrace.status() == BacktraceStatus::Captured;
        write!(f, "{:?}", self.kind)?;
        if let Some(source) = &self.source {
            write!(f, "\nCaused by: \n{}", source)?;
        }
        if has_backtrace {
            write!(f, "\nBacktrace:\n{:2}", self.backtrace)
        } else {
            write!(f, "\nTo enable Rust backtraces, use RUST_BACKTRACE=1")
        }
    }
}

impl From<IronfishErrorKind> for IronfishError {
    fn from(kind: IronfishErrorKind) -> Self {
        Self::new(kind)
    }
}

impl From<io::Error> for IronfishError {
    fn from(e: io::Error) -> IronfishError {
        IronfishError::new_with_source(IronfishErrorKind::Io, e)
    }
}

impl From<crypto_box::aead::Error> for IronfishError {
    fn from(e: crypto_box::aead::Error) -> IronfishError {
        IronfishError::new_with_source(IronfishErrorKind::CryptoBox, e)
    }
}

impl From<string::FromUtf8Error> for IronfishError {
    fn from(e: string::FromUtf8Error) -> IronfishError {
        IronfishError::new_with_source(IronfishErrorKind::Utf8, e)
    }
}

impl From<ironfish_bellperson::SynthesisError> for IronfishError {
    fn from(e: ironfish_bellperson::SynthesisError) -> IronfishError {
        IronfishError::new_with_source(IronfishErrorKind::BellpersonSynthesis, e)
    }
}

impl From<num::TryFromIntError> for IronfishError {
    fn from(e: num::TryFromIntError) -> IronfishError {
        IronfishError::new_with_source(IronfishErrorKind::TryFromInt, e)
    }
}

impl From<ironfish_frost::frost::Error> for IronfishError {
    fn from(e: ironfish_frost::frost::Error) -> IronfishError {
        IronfishError::new_with_source(IronfishErrorKind::FrostLibError, e)
    }
}

impl From<ironfish_zkp::hex::HexError> for IronfishError {
    fn from(e: ironfish_zkp::hex::HexError) -> IronfishError {
        IronfishError::new_with_source(IronfishErrorKind::HexError, e)
    }
}
