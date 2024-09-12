import { XChaCha20Poly1305Key } from "@ironfish/rust-nodejs"
import { Mutex } from "../mutex"
import { MasterKeyValue } from "./walletdb/masterKeyValue"
import { Assert } from '../assert'
import { SetTimeoutToken } from ".."

const DEFAULT_UNLOCK_TIMEOUT_MS = 24 * 60 * 60 * 1000

export class MasterKey {
  private mutex: Mutex

  private locked: boolean

  private salt: Buffer
  private nonce: Buffer

  private masterKey: XChaCha20Poly1305Key | null
  private lockTimeout: SetTimeoutToken | null

  constructor(masterKeyValue: MasterKeyValue) {
    this.mutex = new Mutex()

    this.salt = masterKeyValue.salt
    this.nonce = masterKeyValue.nonce

    this.locked = true
    this.masterKey = null
    this.lockTimeout = null
  }

  static generate(passphrase: string): MasterKey {
    const key = new XChaCha20Poly1305Key(passphrase)
    return new MasterKey({ salt: key.salt(), nonce: key.nonce()})
  }

  async lock(): Promise<void> {
    const unlock = await this.mutex.lock()

    try {
      this.stopUnlockTimeout()

      if (this.masterKey) {
        this.masterKey.destroy()
        this.masterKey = null
      }

      this.locked = true
    } finally {
      unlock()
    }
  }

  async unlock(passphrase: string, timeout?: number): Promise<void> {
    const unlock = await this.mutex.lock()

    try {
      this.masterKey = XChaCha20Poly1305Key.fromParts(passphrase, this.salt, this.nonce)

      this.startUnlockTimeout(timeout)
      this.locked = false
    } catch (e) {
      this.stopUnlockTimeout()

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

  derive(salt: Buffer, nonce: Buffer): XChaCha20Poly1305Key {
    Assert.isFalse(this.locked)
    Assert.isNotNull(this.masterKey)

    return this.masterKey.deriveKey(salt, nonce)
  }

  private startUnlockTimeout(timeout?: number): void {
    if (!timeout) {
      timeout = DEFAULT_UNLOCK_TIMEOUT_MS
    }

    this.stopUnlockTimeout()

    // Keep the wallet unlocked indefinitely
    if (timeout === -1) {
      return
    }

    this.lockTimeout = setTimeout(() => void this.lock(), timeout)
  }

  private stopUnlockTimeout(): void {
    if (this.lockTimeout) {
      clearTimeout(this.lockTimeout)
      this.lockTimeout = null
    }
  }
}
