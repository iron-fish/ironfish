import { XChaCha20Poly1305Key } from "@ironfish/rust-nodejs"
import { Mutex } from "../mutex"
import { MasterKeyValue } from "./walletdb/masterKeyValue"
import { Assert } from '../assert'

export class MasterKey {
  private mutex: Mutex

  private locked: boolean

  readonly salt: Buffer
  readonly nonce: Buffer

  private masterKey: XChaCha20Poly1305Key | null

  constructor(masterKeyValue: MasterKeyValue) {
    this.mutex = new Mutex()

    this.salt = masterKeyValue.salt
    this.nonce = masterKeyValue.nonce

    this.locked = true
    this.masterKey = null
  }

  static generate(passphrase: string): MasterKey {
    const key = new XChaCha20Poly1305Key(passphrase)
    return new MasterKey({ salt: key.salt(), nonce: key.nonce()})
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

  // You must explicitly call lock
  async unlock(passphrase: string): Promise<XChaCha20Poly1305Key> {
    const unlock = await this.mutex.lock()

    try {
      this.masterKey = XChaCha20Poly1305Key.fromParts(passphrase, this.salt, this.nonce)
      this.locked = false
      
      return this.masterKey
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

  deriveNewKey(): XChaCha20Poly1305Key {
    Assert.isFalse(this.locked)
    Assert.isNotNull(this.masterKey)

    return this.masterKey.deriveNewKey()
  }

  deriveKey(salt: Buffer, nonce: Buffer): XChaCha20Poly1305Key {
    Assert.isFalse(this.locked)
    Assert.isNotNull(this.masterKey)

    return this.masterKey.deriveKey(salt, nonce)
  }

  async destroy(): Promise<void> {
    await this.lock()
    this.nonce.fill(0)
    this.salt.fill(0)
  }
}
