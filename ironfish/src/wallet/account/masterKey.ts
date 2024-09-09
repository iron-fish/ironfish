import { encrypt } from "@ironfish/rust-nodejs"
import { Logger } from "../../logger"
import { Mutex } from "../../mutex"

const DEFAULT_UNLOCK_TIMEOUT_MS = 24 * 60 * 60 * 1000

export class MasterKey {
  private readonly raw: Buffer | null
  private readonly mutex: Mutex

  private readonly encrypted: boolean
  private readonly cipherData: Buffer | null

  constructor() {
    this.raw = null 
    this.mutex = new Mutex()

    this.encrypted = false
    this.cipherData = null
  }

  async encrypt(passphrase: string): Promise<Buffer> {
    const unlock = await this.mutex.lock()

    try {
      if (this.encrypted) {
        throw new Error('Master key is encrypted already')
      }

      this.stopUnlockTimeout()

      const key = deriveXChaCha20Poly1305Key(passphrase)
      const data = encrypt(key)
    } finally {
      unlock()
    }
  }

  async decrypt(passphrase: string): Promise<void> {
    const unlock = await this.mutex.lock()

    try {
      await this.walletDb.decryptAccounts(passphrase)
      await this.load()
    } catch (e) {
      throw e
    } finally {
      unlock()
    }
  }

  async lock(): Promise<void> {
    const unlock = await this.mutex.lock()

    try {
      const encrypted = await this.walletDb.accountsEncrypted(tx)
      if (!encrypted) {
        return
      }

      this.stopUnlockTimeout()
      this.accountById.clear()
      this.locked = true
    } finally {
      unlock()
    }
  }

  async unlock(passphrase: string, timeout?: number): Promise<void> {
    const unlock = await this.mutex.lock()

    try {
      const encrypted = await this.walletDb.accountsEncrypted(tx)
      if (!encrypted) {
        return
      }

      for (const [id, account] of this.encryptedAccountById.entries()) {
        this.accountById.set(id, account.decrypt(passphrase))
      }

      this.startUnlockTimeout(timeout)
      this.locked = false
    } catch (e) {
      this.logger.debug('Wallet unlock failed')
      this.stopUnlockTimeout()
      this.accountById.clear()
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
