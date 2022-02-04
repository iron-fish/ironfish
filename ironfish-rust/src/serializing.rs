/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/// Helper functions to convert pairing parts to bytes
///
/// The traits in the pairing and zcash_primitives libraries
/// all have functions for serializing, but their interface
/// can be a bit clunky if you're just working with bytearrays.
use super::errors;
use ff::PrimeField;

use std::io;
use zcash_primitives::jubjub::{edwards, JubjubEngine, PrimeOrder};

/// convert an edwards point of prime order to a bytes representation
pub(crate) fn point_to_bytes<J: JubjubEngine + pairing::MultiMillerLoop>(
    point: &edwards::Point<J, PrimeOrder>,
) -> Result<[u8; 32], errors::SaplingKeyError> {
    let mut result: [u8; 32] = [0; 32];
    point.write(&mut result[..])?;
    Ok(result)
}

/// convert a scalar to a bytes representation
pub(crate) fn scalar_to_bytes<F: PrimeField>(scalar: &F) -> [u8; 32] {
    let mut result = [0; 32];
    result[..].clone_from_slice(scalar.to_repr().as_ref());

    result
}

#[allow(dead_code)]
pub(crate) fn bytes_to_scalar<F: PrimeField>(bytes: &[u8; 32]) -> F {
    read_scalar(bytes[..].as_ref())
        .expect("Should be able to construct prime field from hash bytes")
}

pub(crate) fn read_scalar<F: PrimeField, R: io::Read>(
    mut reader: R,
) -> Result<F, errors::SaplingKeyError> {
    let mut fr_repr = F::Repr::default();
    reader.read_exact(fr_repr.as_mut())?;
    let scalar = F::from_repr(fr_repr).ok_or(errors::SaplingKeyError::IOError)?;
    Ok(scalar)
}

/// Output the bytes as a hexadecimal String
pub(crate) fn bytes_to_hex(bytes: &[u8]) -> String {
    bytes
        .iter()
        .map(|b| format!("{:02x}", b))
        .collect::<Vec<String>>()
        .join("")
}

/// Output the hexadecimal String as bytes
pub(crate) fn hex_to_bytes(hex: &str) -> Result<Vec<u8>, ()> {
    let mut bite_iterator = hex.as_bytes().iter().map(|b| match b {
        b'0'..=b'9' => Ok(b - b'0'),
        b'a'..=b'f' => Ok(b - b'a' + 10),
        b'A'..=b'F' => Ok(b - b'A' + 10),
        _ => Err(()),
    });
    let mut bytes = Vec::new();
    let mut high = bite_iterator.next();
    let mut low = bite_iterator.next();
    loop {
        match (high, low) {
            (Some(Ok(h)), Some(Ok(l))) => bytes.push(h << 4 | l),
            (None, None) => break,
            _ => return Err(()),
        }
        high = bite_iterator.next();
        low = bite_iterator.next();
    }

    Ok(bytes)
}

pub(crate) mod aead {
    use crate::errors;
    use crypto::{
        aead::{AeadDecryptor, AeadEncryptor},
        chacha20poly1305::ChaCha20Poly1305,
    };

    pub const MAC_SIZE: usize = 16;

    /// Encrypt the plaintext using the given key, and append the MAC tag to the
    /// end of the output array to be decrypted and checked in one step below.
    ///
    /// This is just a facade around the ChaCha20Poly1305 struct. It ignores
    /// nonce and aad and automatically stores the mac tag.
    pub(crate) fn encrypt(key: &[u8], plaintext: &[u8], encrypted_output: &mut [u8]) {
        assert_eq!(encrypted_output.len(), plaintext.len() + MAC_SIZE);
        let mut encryptor = ChaCha20Poly1305::new(key, &[0; 8], &[0; 8]);
        let mut tag = [0; MAC_SIZE];
        encryptor.encrypt(
            plaintext,
            &mut encrypted_output[..plaintext.len()],
            &mut tag,
        );
        encrypted_output[plaintext.len()..].clone_from_slice(&tag);
    }

    /// Decrypt the encrypted text using the given key and ciphertext, also checking
    /// that the mac tag is correct.
    ///
    /// Returns Ok(()) if the mac matches the decrypted text, Err(()) if not
    pub(crate) fn decrypt(
        key: &[u8],
        ciphertext: &[u8],
        plaintext_output: &mut [u8],
    ) -> Result<(), errors::NoteError> {
        assert!(plaintext_output.len() == ciphertext.len() - MAC_SIZE);
        let mut decryptor = ChaCha20Poly1305::new(key, &[0; 8], &[0; 8]);
        let success = decryptor.decrypt(
            &ciphertext[..ciphertext.len() - MAC_SIZE],
            plaintext_output,
            &ciphertext[ciphertext.len() - MAC_SIZE..],
        );

        if success {
            Ok(())
        } else {
            Err(errors::NoteError::KeyError)
        }
    }

    #[cfg(test)]
    mod test {
        use super::{decrypt, encrypt};

        #[test]
        fn test_aead_facade() {
            let key = b"I'm so secret!!!";
            let plaintext = b"hello world";
            let mut encrypted_text = [0; 27];
            encrypt(&key[..], &plaintext[..], &mut encrypted_text[..]);

            let mut decrypted_plaintext = [0; 11];
            decrypt(&key[..], &encrypted_text[..], &mut decrypted_plaintext[..])
                .expect("Should successfully decrypt with MAC verification");
            assert_eq!(&decrypted_plaintext, plaintext);
        }
    }
}
