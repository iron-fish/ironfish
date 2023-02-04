/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  AMOUNT_VALUE_LENGTH,
  Transaction as NativeTransaction,
  TRANSACTION_EXPIRATION_LENGTH,
  TRANSACTION_FEE_LENGTH,
} from '@ironfish/rust-nodejs'
import { Asset, ASSET_ID_LENGTH } from '@ironfish/rust-nodejs'
import bufio from 'bufio'
import { Witness } from '../merkletree'
import { NoteHasher } from '../merkletree/hasher'
import { Side } from '../merkletree/merkletree'
import { BurnDescription } from './burnDescription'
import { Note } from './note'
import { NoteEncrypted, NoteEncryptedHash, SerializedNoteEncryptedHash } from './noteEncrypted'
import { Transaction } from './transaction'

// Needed for constructing a witness when creating transactions
const noteHasher = new NoteHasher()
const MAX_MINT_OR_BURN_VALUE = BigInt(100_000_000_000_000_000n)

export interface MintData {
  name: string
  metadata: string
  value: bigint
}

export class RawTransaction {
  expiration: number | null = null
  fee = 0n
  mints: MintData[] = []
  burns: BurnDescription[] = []
  receives: { note: Note }[] = []

  spends: {
    note: Note
    witness: Witness<
      NoteEncrypted,
      NoteEncryptedHash,
      NoteEncryptedHash,
      SerializedNoteEncryptedHash
    >
  }[] = []

  post(spendingKey: string): Transaction {
    const builder = new NativeTransaction(spendingKey)

    for (const spend of this.spends) {
      builder.spend(spend.note.takeReference(), spend.witness)
      spend.note.returnReference()
    }

    for (const receive of this.receives) {
      builder.output(receive.note.takeReference())
      receive.note.returnReference()
    }

    for (const mint of this.mints) {
      if (mint.value > MAX_MINT_OR_BURN_VALUE) {
        throw new Error('Cannot post transaction. Mint value exceededs maximum')
      }

      const asset = new Asset(spendingKey, mint.name, mint.metadata)

      builder.mint(asset, mint.value)
    }

    for (const burn of this.burns) {
      if (burn.value > MAX_MINT_OR_BURN_VALUE) {
        throw new Error('Cannot post transaction. Burn value exceededs maximum')
      }

      builder.burn(burn.assetId, burn.value)
    }

    if (this.expiration !== null) {
      builder.setExpiration(this.expiration)
    }

    const serialized = builder.post(null, this.fee)
    const posted = new Transaction(serialized)

    return posted
  }
}

export class RawTransactionSerde {
  static serialize(raw: RawTransaction): Buffer {
    const bw = bufio.write(this.getSize(raw))

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

    bw.writeU64(raw.receives.length)
    for (const receive of raw.receives) {
      bw.writeVarBytes(receive.note.serialize())
    }

    bw.writeU64(raw.mints.length)
    for (const mint of raw.mints) {
      bw.writeVarString(mint.name)
      bw.writeVarString(mint.metadata)
      bw.writeBigU64(mint.value)
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

    const raw = new RawTransaction()
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

    const receivesLength = reader.readU64()
    for (let i = 0; i < receivesLength; i++) {
      const note = new Note(reader.readVarBytes())
      raw.receives.push({ note })
    }

    const mintsLength = reader.readU64()
    for (let i = 0; i < mintsLength; i++) {
      const name = reader.readVarString()
      const metadata = reader.readVarString()
      const value = reader.readBigU64()
      raw.mints.push({ name, metadata, value })
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

    size += 8 // raw.receives.length
    for (const receive of raw.receives) {
      size += bufio.sizeVarBytes(receive.note.serialize())
    }

    size += 8 // raw.mints.length
    for (const mint of raw.mints) {
      size += bufio.sizeVarString(mint.name)
      size += bufio.sizeVarString(mint.metadata)
      size += AMOUNT_VALUE_LENGTH // mint.value
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
