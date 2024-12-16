/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  AMOUNT_VALUE_LENGTH,
  Asset,
  ASSET_ID_LENGTH,
  ASSET_LENGTH,
  PROOF_LENGTH,
  PUBLIC_ADDRESS_LENGTH,
  Transaction as NativeTransaction,
  TRANSACTION_EXPIRATION_LENGTH,
  TRANSACTION_FEE_LENGTH,
  TRANSACTION_PUBLIC_KEY_RANDOMNESS_LENGTH,
  TRANSACTION_SIGNATURE_LENGTH,
  UnsignedTransaction,
} from '@ironfish/rust-nodejs'
import bufio from 'bufio'
import { Assert } from '../assert'
import { Witness } from '../merkletree'
import { NoteHasher } from '../merkletree/hasher'
import { Side } from '../merkletree/merkletree'
import { CurrencyUtils } from '../utils/currency'
import { AssetBalances } from '../wallet/assetBalances'
import { BurnDescription } from './burnDescription'
import { Note } from './note'
import { NoteEncrypted, NoteEncryptedHash, SerializedNoteEncryptedHash } from './noteEncrypted'
import { SPEND_SERIALIZED_SIZE_IN_BYTE } from './spend'
import { Transaction, TransactionFeatures, TransactionVersion } from './transaction'

// Needed for constructing a witness when creating transactions
const noteHasher = new NoteHasher()
const MAX_MINT_OR_BURN_VALUE = BigInt(100_000_000_000_000_000n)

export interface MintData {
  creator: string
  name: string
  metadata: string
  value: bigint
  transferOwnershipTo?: string
}

export class RawTransaction {
  version: TransactionVersion
  expiration: number | null = null
  fee = 0n
  mints: MintData[] = []
  burns: BurnDescription[] = []
  outputs: { note: Note }[] = []

  spends: {
    note: Note
    witness: Witness<
      NoteEncrypted,
      NoteEncryptedHash,
      NoteEncryptedHash,
      SerializedNoteEncryptedHash
    >
  }[] = []

  constructor(version: TransactionVersion) {
    this.version = version
  }

  postedSize(): number {
    let size = 0
    size += 1 // version
    size += 8 // spends length
    size += 8 // notes length
    size += 8 // mints length
    size += 8 // burns length
    size += TRANSACTION_FEE_LENGTH // fee
    size += TRANSACTION_EXPIRATION_LENGTH // expiration
    size += TRANSACTION_PUBLIC_KEY_RANDOMNESS_LENGTH // public key randomness
    size += this.spends.length * SPEND_SERIALIZED_SIZE_IN_BYTE
    size += this.outputs.length * (PROOF_LENGTH + NoteEncrypted.size)
    size += this.mints
      .map((mint) => {
        let mintSize =
          PROOF_LENGTH + ASSET_LENGTH + AMOUNT_VALUE_LENGTH + TRANSACTION_SIGNATURE_LENGTH
        if (TransactionFeatures.hasMintTransferOwnershipTo(this.version)) {
          mintSize += PUBLIC_ADDRESS_LENGTH // owner

          // transferOwnershipTo
          mintSize += 1
          if (mint.transferOwnershipTo) {
            mintSize += PUBLIC_ADDRESS_LENGTH
          }
        }
        return mintSize
      })
      .reduce((size, mintSize) => size + mintSize, 0)
    size += this.burns.length * (ASSET_ID_LENGTH + 8)
    size += TRANSACTION_SIGNATURE_LENGTH // signature

    // Each asset might have a change note, which would need to be accounted for
    const assetTotals = new AssetBalances()
    for (const mint of this.mints) {
      const asset = new Asset(mint.creator, mint.name, mint.metadata)
      assetTotals.increment(asset.id(), mint.value)
    }
    for (const burn of this.burns) {
      assetTotals.increment(burn.assetId, -burn.value)
    }
    for (const spend of this.spends) {
      assetTotals.increment(spend.note.assetId(), -spend.note.value())
    }
    for (const output of this.outputs) {
      assetTotals.increment(output.note.assetId(), output.note.value())
    }
    assetTotals.increment(Asset.nativeId(), this.fee)
    for (const [, value] of assetTotals) {
      if (value !== 0n) {
        size += PROOF_LENGTH + NoteEncrypted.size
      }
    }
    return size
  }

  _build(): NativeTransaction {
    const builder = new NativeTransaction(this.version)
    for (const spend of this.spends) {
      builder.spend(spend.note.takeReference(), spend.witness)
      spend.note.returnReference()
    }

    for (const output of this.outputs) {
      builder.output(output.note.takeReference())
      output.note.returnReference()
    }

    for (const mint of this.mints) {
      if (mint.value > MAX_MINT_OR_BURN_VALUE) {
        const renderedValue = CurrencyUtils.renderOre(mint.value)
        const renderedMax = CurrencyUtils.renderOre(MAX_MINT_OR_BURN_VALUE)
        throw new Error(
          `Cannot post transaction. Mint value ${renderedValue} exceededs maximum ${renderedMax}.`,
        )
      }
      const asset = new Asset(mint.creator, mint.name, mint.metadata)

      builder.mint(asset, mint.value, mint.transferOwnershipTo)
    }

    for (const burn of this.burns) {
      if (burn.value > MAX_MINT_OR_BURN_VALUE) {
        const renderedValue = CurrencyUtils.renderOre(burn.value)
        const renderedMax = CurrencyUtils.renderOre(MAX_MINT_OR_BURN_VALUE)
        throw new Error(
          `Cannot post transaction. Burn value ${renderedValue} exceededs maximum ${renderedMax}`,
        )
      }

      builder.burn(burn.assetId, burn.value)
    }

    if (this.expiration !== null) {
      builder.setExpiration(this.expiration)
    }

    return builder
  }

  build(
    proofAuthorizingKey: string,
    viewKey: string,
    outgoingViewKey: string,
  ): UnsignedTransaction {
    const builder = this._build()

    const serialized = builder.build(
      proofAuthorizingKey,
      viewKey,
      outgoingViewKey,
      this.fee,
      null,
    )

    return new UnsignedTransaction(serialized)
  }

  post(spendingKey: string): Transaction {
    const builder = this._build()
    const serialized = builder.post(spendingKey, null, this.fee)
    const posted = new Transaction(serialized)

    return posted
  }

  sender(): string | undefined {
    if (this.spends.length > 0) {
      return this.spends[0].note.owner()
    } else if (this.outputs.length > 0) {
      return this.outputs[0].note.sender()
    } else if (this.mints.length > 0) {
      return this.mints[0].creator
    }
  }
}

export class RawTransactionSerde {
  static serialize(raw: RawTransaction): Buffer {
    const bw = bufio.write(this.getSize(raw))

    bw.writeU8(raw.version)

    bw.writeBigU64(raw.fee)

    bw.writeU64(raw.spends.length)
    for (const spend of raw.spends) {
      bw.writeVarBytes(spend.note.serialize())

      bw.writeU64(spend.witness.treeSize())
      bw.writeVarBytes(spend.witness.rootHash)
      bw.writeU64(spend.witness.authPath().length)
      for (const step of spend.witness.authPath()) {
        switch (step.side()) {
          case Side.Left:
            bw.writeU8(0)
            break
          case Side.Right:
            bw.writeU8(1)
            break
        }
        bw.writeVarBytes(step.hashOfSibling())
      }
    }

    bw.writeU64(raw.outputs.length)
    for (const output of raw.outputs) {
      bw.writeVarBytes(output.note.serialize())
    }

    bw.writeU64(raw.mints.length)
    for (const mint of raw.mints) {
      bw.writeVarString(mint.creator, 'utf8')
      bw.writeVarString(mint.name, 'utf8')
      bw.writeVarString(mint.metadata, 'utf8')
      bw.writeBigU64(mint.value)
      if (TransactionFeatures.hasMintTransferOwnershipTo(raw.version)) {
        if (mint.transferOwnershipTo) {
          bw.writeU8(1)
          bw.writeBytes(Buffer.from(mint.transferOwnershipTo, 'hex'))
        } else {
          bw.writeU8(0)
        }
      } else {
        Assert.isUndefined(
          mint.transferOwnershipTo,
          'Version 1 transactions cannot contain transferOwnershipTo',
        )
      }
    }

    bw.writeU64(raw.burns.length)
    for (const burn of raw.burns) {
      bw.writeBytes(burn.assetId)
      bw.writeBigU64(burn.value)
    }

    bw.writeU8(Number(raw.expiration != null))
    if (raw.expiration != null) {
      bw.writeU32(raw.expiration)
    }

    return bw.render()
  }

  static deserialize(buffer: Buffer): RawTransaction {
    const reader = bufio.read(buffer, true)

    const version = reader.readU8()

    const raw = new RawTransaction(version)
    raw.fee = reader.readBigU64()

    const spendsLength = reader.readU64()
    for (let i = 0; i < spendsLength; i++) {
      const note = new Note(reader.readVarBytes())

      const treeSize = reader.readU64()
      const rootHash = reader.readVarBytes()
      const authPathLength = reader.readU64()
      const authPath = []
      for (let j = 0; j < authPathLength; j++) {
        const side = reader.readU8() ? Side.Right : Side.Left
        const hashOfSibling = reader.readVarBytes()
        authPath.push({ side, hashOfSibling })
      }

      const witness = new Witness(treeSize, rootHash, authPath, noteHasher)

      raw.spends.push({ note, witness })
    }

    const outputsLength = reader.readU64()
    for (let i = 0; i < outputsLength; i++) {
      const note = new Note(reader.readVarBytes())
      raw.outputs.push({ note })
    }

    const mintsLength = reader.readU64()
    for (let i = 0; i < mintsLength; i++) {
      const creator = reader.readVarString('utf8')
      const name = reader.readVarString('utf8')
      const metadata = reader.readVarString('utf8')
      const value = reader.readBigU64()

      let transferOwnershipTo = undefined
      if (TransactionFeatures.hasMintTransferOwnershipTo(raw.version)) {
        if (reader.readU8()) {
          transferOwnershipTo = reader.readBytes(PUBLIC_ADDRESS_LENGTH).toString('hex')
        }
      }

      raw.mints.push({ creator, name, metadata, value, transferOwnershipTo })
    }

    const burnsLength = reader.readU64()
    for (let i = 0; i < burnsLength; i++) {
      const assetId = reader.readBytes(ASSET_ID_LENGTH)
      const value = reader.readBigU64()
      raw.burns.push({ assetId, value })
    }

    const hasExpiration = reader.readU8()
    if (hasExpiration) {
      raw.expiration = reader.readU32()
    }

    return raw
  }

  static getSize(raw: RawTransaction): number {
    let size = 0

    size += 1 // raw.version

    size += TRANSACTION_FEE_LENGTH // raw.fee

    size += 8 // raw.spends.length
    for (const spend of raw.spends) {
      size += bufio.sizeVarBytes(spend.note.serialize())

      size += 8 // spend.witness.treeSize()
      size += bufio.sizeVarBytes(spend.witness.rootHash)
      size += 8 // spend.witness.authPath.length
      for (const step of spend.witness.authPath()) {
        size += 1 // step.side()
        size += bufio.sizeVarBytes(step.hashOfSibling())
      }
    }

    size += 8 // raw.outputs.length
    for (const output of raw.outputs) {
      size += bufio.sizeVarBytes(output.note.serialize())
    }

    size += 8 // raw.mints.length
    for (const mint of raw.mints) {
      size += bufio.sizeVarString(mint.creator, 'utf8')
      size += bufio.sizeVarString(mint.name, 'utf8')
      size += bufio.sizeVarString(mint.metadata, 'utf8')
      size += AMOUNT_VALUE_LENGTH // mint.value

      if (TransactionFeatures.hasMintTransferOwnershipTo(raw.version)) {
        size += 1
        if (mint.transferOwnershipTo) {
          size += PUBLIC_ADDRESS_LENGTH
        }
      }
    }

    size += 8 // raw.burns.length
    for (const _ of raw.burns) {
      size += ASSET_ID_LENGTH // burn.assetId
      size += AMOUNT_VALUE_LENGTH // burn.value
    }

    size += 1 // has expiration sequence
    if (raw.expiration != null) {
      size += TRANSACTION_EXPIRATION_LENGTH // raw.expiration
    }

    return size
  }
}
