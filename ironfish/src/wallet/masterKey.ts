import { encrypt } from "@ironfish/rust-nodejs"
import { Logger } from "../logger"
import { Mutex } from "../mutex"
import { MasterKeyValue } from "./walletdb/masterKeyValue"
import { Assert } from "../assert"

const DEFAULT_UNLOCK_TIMEOUT_MS = 24 * 60 * 60 * 1000

export class MasterKey {
  private mutex: Mutex

  private locked: boolean

  private salt: Buffer
  private nonce: Buffer
  private encryptedMasterKey: Buffer

  private masterKey: Buffer | null

  constructor(masterKeyValue: MasterKeyValue) {
    this.mutex = new Mutex()

    this.salt = masterKeyValue.salt
    this.nonce = masterKeyValue.nonce
    this.encryptedMasterKey = masterKeyValue.encryptedMasterKey

    this.masterKey = null
  }

  static generate(passphrase: string): MasterKey {
    const 
  }

  async lock(): Promise<void> {
    const unlock = await this.mutex.lock()

    try {
      this.stopUnlockTimeout()

      if (this.masterKey) {
        this.masterKey.fill(0)
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
      this.masterKey = decrypt(this.encryptedMasterKey, passphrase)

      this.startUnlockTimeout(timeout)
      this.locked = false
    } catch (e) {
      this.stopUnlockTimeout()

      if (this.masterKey) {
        this.masterKey.fill(0)
        this.masterKey = null
      }

      this.locked = true

      throw e
    } finally {
      unlock()
    }
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
