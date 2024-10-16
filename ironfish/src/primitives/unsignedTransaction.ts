/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  Asset,
  ASSET_ID_LENGTH,
  ASSET_LENGTH,
  ENCRYPTED_NOTE_LENGTH,
  PROOF_LENGTH,
  PUBLIC_ADDRESS_LENGTH,
  TRANSACTION_PUBLIC_KEY_RANDOMNESS_LENGTH,
  TRANSACTION_SIGNATURE_LENGTH,
  UnsignedTransaction as NativeUnsignedTransaction,
} from '@ironfish/rust-nodejs'
import bufio from 'bufio'
import { BurnDescription } from './burnDescription'
import { MintDescription } from './mintDescription'
import { NoteEncrypted } from './noteEncrypted'
import { Spend } from './spend'
import { TransactionFeatures, TransactionVersion, UnsupportedVersionError } from './transaction'

export class UnsignedTransaction {
  private readonly unsignedTransactionSerialized: Buffer
  private referenceCount = 0
  private nativeUnsignedTransaction: NativeUnsignedTransaction | null = null

  public readonly notes: NoteEncrypted[]
  public readonly spends: Spend[]
  public readonly mints: MintDescription[]
  public readonly burns: BurnDescription[]

  private readonly _version: TransactionVersion
  private readonly _fee: bigint
  private readonly _expiration: number

  constructor(unsignedTransactionSerialized: Buffer) {
    this.unsignedTransactionSerialized = unsignedTransactionSerialized
    const reader = bufio.read(this.unsignedTransactionSerialized, true)

    this._version = reader.readU8() // 1
    if (this._version < TransactionVersion.V1 || this._version > TransactionVersion.V2) {
      throw new UnsupportedVersionError(this._version)
    }
    const _spendsLength = reader.readU64() // 8
    const _notesLength = reader.readU64() // 8
    const _mintsLength = reader.readU64() // 8
    const _burnsLength = reader.readU64() // 8
    this._fee = reader.readBigI64() // 8
    this._expiration = reader.readU32() // 4
    // randomized public key of sender
    reader.seek(PUBLIC_ADDRESS_LENGTH)
    // public key randomness
    reader.seek(TRANSACTION_PUBLIC_KEY_RANDOMNESS_LENGTH)

    // spend description
    this.spends = Array.from({ length: _spendsLength }, () => {
      // public key randomness
      reader.seek(PUBLIC_ADDRESS_LENGTH)
      // proof 192
      reader.seek(PROOF_LENGTH)
      // value commitment
      reader.seek(32)

      const rootHash = reader.readHash() // 32
      const treeSize = reader.readU32() // 4
      const nullifier = reader.readHash() // 32

      // signature 64
      reader.seek(TRANSACTION_SIGNATURE_LENGTH)

      // total serialized size: 192 + 32 + 32 + 4 + 32 + 64 = 356 bytes
      return {
        size: treeSize,
        commitment: rootHash,
        nullifier,
      }
    })

    // output description
    this.notes = Array.from({ length: _notesLength }, () => {
      // proof
      reader.seek(PROOF_LENGTH)

      // output note
      return new NoteEncrypted(reader.readBytes(ENCRYPTED_NOTE_LENGTH, true))
    })

    this.mints = Array.from({ length: _mintsLength }, () => {
      // public key randomness
      reader.seek(PUBLIC_ADDRESS_LENGTH)
      // proof
      reader.seek(PROOF_LENGTH)

      const asset = Asset.deserialize(reader.readBytes(ASSET_LENGTH))
      const value = reader.readBigU64()

      let owner = null
      let transferOwnershipTo = null
      if (TransactionFeatures.hasMintTransferOwnershipTo(this._version)) {
        owner = reader.readBytes(PUBLIC_ADDRESS_LENGTH)
        if (reader.readU8()) {
          transferOwnershipTo = reader.readBytes(PUBLIC_ADDRESS_LENGTH)
        }
      } else {
        owner = asset.creator()
      }

      // authorizing signature
      reader.seek(TRANSACTION_SIGNATURE_LENGTH)

      return { asset, value, owner, transferOwnershipTo }
    })

    this.burns = Array.from({ length: _burnsLength }, () => {
      const assetId = reader.readBytes(ASSET_ID_LENGTH)
      const value = reader.readBigU64()

      return { assetId, value }
    })

    // binding signature
    reader.seek(TRANSACTION_SIGNATURE_LENGTH)
  }

  serialize(): Buffer {
    return this.unsignedTransactionSerialized
  }

  /**
   * Preallocate any resources necessary for using the transaction.
   */
  takeReference(): NativeUnsignedTransaction {
    this.referenceCount++
    if (this.nativeUnsignedTransaction === null) {
      this.nativeUnsignedTransaction = new NativeUnsignedTransaction(
        this.unsignedTransactionSerialized,
      )
    }
    return this.nativeUnsignedTransaction
  }

  /**
   * Return any resources necessary for using the transaction.
   */
  returnReference(): void {
    this.referenceCount--
    if (this.referenceCount <= 0) {
      this.referenceCount = 0
      this.nativeUnsignedTransaction = null
    }
  }

  /**
   * Wraps the given callback in takeReference and returnReference.
   */
  withReference<R>(callback: (transaction: NativeUnsignedTransaction) => R): R {
    const transaction = this.takeReference()

    const result = callback(transaction)

    void Promise.resolve(result).finally(() => {
      this.returnReference()
    })

    return result
  }

  hash(): Buffer {
    const hash = this.takeReference().hash()
    this.returnReference()
    return hash
  }

  publicKeyRandomness(): string {
    const publicKeyRandomness = this.takeReference().publicKeyRandomness()
    this.returnReference()
    return publicKeyRandomness
  }

  fee(): bigint {
    return this._fee
  }

  expiration(): number {
    return this._expiration
  }
}
