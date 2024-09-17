/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use ironfish::xchacha20poly1305::{
    XChaCha20Poly1305Key, KEY_LENGTH as KEY_SIZE, SALT_LENGTH as SALT_SIZE,
    XNONCE_LENGTH as XNONCE_SIZE,
};
use napi::{bindgen_prelude::*, JsBuffer};
use napi_derive::napi;

use crate::to_napi_err;

#[napi{namespace = "xchacha20poly1305"}]
pub const XKEY_LENGTH: u32 = KEY_SIZE as u32;

#[napi{namespace = "xchacha20poly1305"}]
pub const XSALT_LENGTH: u32 = SALT_SIZE as u32;

#[napi{namespace = "xchacha20poly1305"}]
pub const XNONCE_LENGTH: u32 = XNONCE_SIZE as u32;

#[napi(js_name = "XChaCha20Poly1305Key", namespace = "xchacha20poly1305")]
pub struct NativeXChaCha20Poly1305Key {
    pub(crate) key: XChaCha20Poly1305Key,
}

#[napi{namespace = "xchacha20poly1305"}]
impl NativeXChaCha20Poly1305Key {
    #[napi(constructor)]
    pub fn generate(passphrase: String) -> Result<NativeXChaCha20Poly1305Key> {
        let key = XChaCha20Poly1305Key::generate(passphrase.as_bytes()).map_err(to_napi_err)?;

        Ok(NativeXChaCha20Poly1305Key { key })
    }

    #[napi]
    pub fn from_parts(
        passphrase: String,
        salt: JsBuffer,
        nonce: JsBuffer,
    ) -> Result<NativeXChaCha20Poly1305Key> {
        let salt_buffer = salt.into_value()?;
        let salt_vec = salt_buffer.as_ref();
        let mut salt_bytes = [0u8; SALT_SIZE];
        salt_bytes.clone_from_slice(&salt_vec[0..SALT_SIZE]);

        let nonce_buffer = nonce.into_value()?;
        let nonce_vec = nonce_buffer.as_ref();
        let mut nonce_bytes = [0; XNONCE_SIZE];
        nonce_bytes.clone_from_slice(&nonce_vec[0..XNONCE_SIZE]);

        let key = XChaCha20Poly1305Key::from_parts(passphrase.as_bytes(), salt_bytes, nonce_bytes)
            .map_err(to_napi_err)?;

        Ok(NativeXChaCha20Poly1305Key { key })
    }

    #[napi]
    pub fn derive_key(
        &self,
        salt: JsBuffer,
        nonce: JsBuffer,
    ) -> Result<NativeXChaCha20Poly1305Key> {
        let salt_buffer = salt.into_value()?;
        let salt_vec = salt_buffer.as_ref();
        let mut salt_bytes = [0; SALT_SIZE];
        salt_bytes.clone_from_slice(&salt_vec[0..SALT_SIZE]);

        let derived_key = self.key.derive_key(salt_bytes).map_err(to_napi_err)?;

        let nonce_buffer = nonce.into_value()?;
        let nonce_vec = nonce_buffer.as_ref();
        let mut nonce_bytes = [0; XNONCE_SIZE];
        nonce_bytes.clone_from_slice(&nonce_vec[0..XNONCE_SIZE]);

        let key = XChaCha20Poly1305Key {
            key: derived_key,
            nonce: nonce_bytes,
            salt: salt_bytes,
        };

        Ok(NativeXChaCha20Poly1305Key { key })
    }

    #[napi]
    pub fn derive_new_key(&self) -> Result<NativeXChaCha20Poly1305Key> {
        let key = self.key.derive_new_key().map_err(to_napi_err)?;

        Ok(NativeXChaCha20Poly1305Key { key })
    }

    #[napi(factory)]
    pub fn deserialize(js_bytes: JsBuffer) -> Result<Self> {
        let byte_vec = js_bytes.into_value()?;

        let key = XChaCha20Poly1305Key::read(byte_vec.as_ref()).map_err(to_napi_err)?;

        Ok(NativeXChaCha20Poly1305Key { key })
    }

    #[napi]
    pub fn destroy(&mut self) -> Result<()> {
        self.key.destroy();
        Ok(())
    }

    #[napi]
    pub fn salt(&self) -> Buffer {
        Buffer::from(self.key.salt.to_vec())
    }

    #[napi]
    pub fn nonce(&self) -> Buffer {
        Buffer::from(self.key.nonce.to_vec())
    }

    #[napi]
    pub fn key(&self) -> Buffer {
        Buffer::from(self.key.key.to_vec())
    }

    #[napi]
    pub fn encrypt(&self, plaintext: JsBuffer) -> Result<Buffer> {
        let plaintext_bytes = plaintext.into_value()?;
        let result = self
            .key
            .encrypt(plaintext_bytes.as_ref())
            .map_err(to_napi_err)?;

        Ok(Buffer::from(&result[..]))
    }

    #[napi]
    pub fn decrypt(&self, ciphertext: JsBuffer) -> Result<Buffer> {
        let byte_vec = ciphertext.into_value()?;
        let result = self.key.decrypt(byte_vec.to_vec()).map_err(to_napi_err)?;

        Ok(Buffer::from(&result[..]))
    }
}
