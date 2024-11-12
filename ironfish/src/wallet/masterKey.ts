/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { xchacha20poly1305 } from '@ironfish/rust-nodejs'
import { Assert } from '../assert'
import { Mutex } from '../mutex'
import { MasterKeyValue } from './walletdb/masterKeyValue'

/**
 * A Master Key implementation for XChaCha20Poly1305. This class can be used
 * to derive child keys deterministically given the child key's salt and nonces.
 *
 * This master key does not automatically lock or unlock. You must call those
 * explicitly if you would like any default timeout behavior.
 */
export class MasterKey {
  private mutex: Mutex
  private locked: boolean

  readonly salt: Buffer
  readonly nonce: Buffer

  private masterKey: xchacha20poly1305.XChaCha20Poly1305Key | null

  constructor(masterKeyValue: MasterKeyValue) {
    this.mutex = new Mutex()

    this.salt = masterKeyValue.salt
    this.nonce = masterKeyValue.nonce

    this.locked = true
    this.masterKey = null
  }

  static generate(passphrase: string): MasterKey {
    const key = new xchacha20poly1305.XChaCha20Poly1305Key(passphrase)
    return new MasterKey({ salt: key.salt(), nonce: key.nonce() })
  }

  async lock(): Promise<void> {
    const unlock = await this.mutex.lock()

    try {
      if (this.masterKey) {
        this.masterKey.destroy()
        this.masterKey = null
      }

      this.locked = true
    } finally {
      unlock()
    }
  }

  async unlock(passphrase: string): Promise<void> {
    const unlock = await this.mutex.lock()

    try {
      this.masterKey = xchacha20poly1305.XChaCha20Poly1305Key.fromParts(
        passphrase,
        this.salt,
        this.nonce,
      )
      this.locked = false

      return
    } catch (e) {
      if (this.masterKey) {
        this.masterKey.destroy()
        this.masterKey = null
      }

      this.locked = true
      throw e
    } finally {
      unlock()
    }
  }

  async destroy(): Promise<void> {
    await this.lock()
  }

  encrypt(plaintext: Buffer): {
    ciphertext: Buffer
    salt: Buffer
    nonce: Buffer
  } {
    Assert.isFalse(this.locked)
    Assert.isNotNull(this.masterKey)

    const derivedKey = this.masterKey.deriveNewKey()

    const ciphertext = derivedKey.encrypt(plaintext)

    return {
      ciphertext,
      salt: derivedKey.salt(),
      nonce: derivedKey.nonce(),
    }
  }

  decrypt(ciphertext: Buffer, salt: Buffer, nonce: Buffer): Buffer {
    Assert.isFalse(this.locked)
    Assert.isNotNull(this.masterKey)

    const derivedKey = this.masterKey.deriveKey(salt, nonce)

    const plaintext = derivedKey.decrypt(ciphertext)

    derivedKey.destroy()

    return plaintext
  }
}
