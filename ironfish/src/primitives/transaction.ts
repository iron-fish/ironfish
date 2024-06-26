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
  TransactionPosted,
} from '@ironfish/rust-nodejs'
import { blake3 } from '@napi-rs/blake-hash'
import bufio from 'bufio'
import { BurnDescription } from './burnDescription'
import { MintDescription } from './mintDescription'
import { NoteEncrypted } from './noteEncrypted'
import { Spend } from './spend'

export type TransactionHash = Buffer

export type SerializedTransaction = Buffer

export enum TransactionVersion {
  V1 = 1,
  V2 = 2,
}

export class TransactionFeatures {
  static hasMintTransferOwnershipTo(version: TransactionVersion): boolean {
    return version >= TransactionVersion.V2
  }
}

export class UnsupportedVersionError extends Error {
  readonly version: number

  constructor(version: number) {
    super(`Unsupported transaction version: ${version}`)
    this.version = version
  }
}

export class Transaction {
  private readonly transactionPostedSerialized: Buffer

  public readonly notes: NoteEncrypted[]
  public readonly spends: Spend[]
  public readonly mints: MintDescription[]
  public readonly burns: BurnDescription[]

  private readonly _version: TransactionVersion
  private readonly _fee: bigint
  private readonly _expiration: number
  private readonly _signature: Buffer
  private _hash?: TransactionHash
  private _unsignedHash?: TransactionHash

  private transactionPosted: TransactionPosted | null = null
  private referenceCount = 0

  constructor(transactionPostedSerialized: Buffer, options?: { skipValidation?: boolean }) {
    this.transactionPostedSerialized = transactionPostedSerialized

    const reader = bufio.read(this.transactionPostedSerialized, true)

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
    // to read the value of rpk reader.readBytes(PUBLIC_ADDRESS_LENGTH, true).toString('hex')
    reader.seek(TRANSACTION_PUBLIC_KEY_RANDOMNESS_LENGTH)

    // spend description
    this.spends = Array.from({ length: _spendsLength }, () => {
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
      return new NoteEncrypted(reader.readBytes(ENCRYPTED_NOTE_LENGTH, true), options)
    })

    this.mints = Array.from({ length: _mintsLength }, () => {
      // proof
      reader.seek(PROOF_LENGTH)

      const asset = Asset.deserialize(reader.readBytes(ASSET_LENGTH), options?.skipValidation)
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

    this._signature = reader.readBytes(TRANSACTION_SIGNATURE_LENGTH, true)
  }

  serialize(): Buffer {
    return this.transactionPostedSerialized
  }

  /**
   * The transaction serialization version. This can be incremented when
   * changes need to be made to the transaction format
   */
  version(): TransactionVersion {
    return this._version
  }

  /**
   * Preallocate any resources necessary for using the transaction.
   */
  takeReference(): TransactionPosted {
    this.referenceCount++
    if (this.transactionPosted === null) {
      this.transactionPosted = new TransactionPosted(this.transactionPostedSerialized)
    }
    return this.transactionPosted
  }

  /**
   * Return any resources necessary for using the transaction.
   */
  returnReference(): void {
    this.referenceCount--
    if (this.referenceCount <= 0) {
      this.referenceCount = 0
      this.transactionPosted = null
    }
  }

  /**
   * Wraps the given callback in takeReference and returnReference.
   */
  withReference<R>(callback: (transaction: TransactionPosted) => R): R {
    const transaction = this.takeReference()

    const result = callback(transaction)

    void Promise.resolve(result).finally(() => {
      this.returnReference()
    })

    return result
  }

  isMinersFee(): boolean {
    return (
      this.spends.length === 0 &&
      this.notes.length === 1 &&
      this.mints.length === 0 &&
      this.burns.length === 0 &&
      this._fee <= 0
    )
  }

  getNote(index: number): NoteEncrypted {
    return this.notes[index]
  }

  getSpend(index: number): Spend {
    return this.spends[index]
  }

  /**
   * Get the transaction fee for this transactions.
   *
   * In general, each transaction has outputs lower than the amount spent; the
   * miner can collect the difference as a transaction fee.
   *
   * In a block header's minersFee transaction, the opposite happens;
   * the miner creates a block with zero spends and output equal to the sum
   * of the miner's fee for the block's transaction, plus the block chain's
   * mining reward.
   *
   * The transaction fee is the difference between outputs and spends on the
   * transaction.
   */
  fee(): bigint {
    return this._fee
  }

  /**
   * Get transaction signature for this transaction.
   */
  transactionSignature(): Buffer {
    return this._signature
  }

  /**
   * Get the transaction hash that does not include the signature. This is the hash that
   * is signed when the transaction is created
   */
  unsignedHash(): TransactionHash {
    this._unsignedHash = this._unsignedHash || this.withReference((t) => t.hash())
    return this._unsignedHash
  }

  /**
   * Generate the hash of a transaction that includes the witness (signature) data.
   * Used for cases where a signature needs to be committed to in the hash like P2P transaction gossip
   */
  hash(): TransactionHash {
    this._hash = this._hash || blake3(this.transactionPostedSerialized)
    return this._hash
  }

  equals(other: Transaction): boolean {
    return this.transactionPostedSerialized.equals(other.transactionPostedSerialized)
  }

  /**
   * @returns The expiration as block sequence of the transaction.
   * The transaction cannot be added to a block of equal or greater sequence
   */
  expiration(): number {
    return this._expiration
  }
}
