/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio, { sizeVarBytes, sizeVarint } from 'bufio'
import { Assert } from '../../assert'
import {
  CompactBlock,
  CompactBlockTransaction,
  GRAFFITI_SIZE,
  RawBlock,
} from '../../primitives/block'
import { RawBlockHeader } from '../../primitives/blockheader'
import { Target } from '../../primitives/target'
import { Transaction } from '../../primitives/transaction'

export const MINERS_FEE_TRANSACTION_SIZE_BYTES = 664

const BLOCK_TRANSACTIONS_LENGTH_BYTES = 2

export function writeBlockHeader(
  bw: bufio.StaticWriter | bufio.BufferWriter,
  header: RawBlockHeader,
): bufio.StaticWriter | bufio.BufferWriter {
  bw.writeU32(header.sequence)
  bw.writeHash(header.previousBlockHash)
  bw.writeHash(header.noteCommitment)
  bw.writeHash(header.transactionCommitment)
  bw.writeBigU256BE(header.target.targetValue)
  bw.writeBigU64(header.randomness)
  bw.writeU64(header.timestamp.getTime())

  Assert.isTrue(header.graffiti.byteLength === GRAFFITI_SIZE)
  bw.writeBytes(header.graffiti)
  return bw
}

export function readBlockHeader(reader: bufio.BufferReader): RawBlockHeader {
  const sequence = reader.readU32()
  const previousBlockHash = reader.readHash()
  const noteCommitment = reader.readHash()
  const transactionCommitment = reader.readHash()
  const target = reader.readBigU256BE()
  const randomness = reader.readBigU64()
  const timestamp = reader.readU64()
  const graffiti = reader.readBytes(GRAFFITI_SIZE)

  return {
    sequence,
    previousBlockHash,
    noteCommitment,
    transactionCommitment,
    target: new Target(target),
    randomness,
    timestamp: new Date(timestamp),
    graffiti,
  }
}

export function getBlockHeaderSize(): number {
  let size = 0
  size += 4 // sequence
  size += 32 // previousBlockHash
  size += 32 // noteCommitment
  size += 32 // transactionCommitment
  size += 32 // target
  size += 8 // randomness
  size += 8 // timestamp
  size += GRAFFITI_SIZE // graffiti
  return size
}

export function writeBlock(
  bw: bufio.StaticWriter | bufio.BufferWriter,
  block: RawBlock,
): bufio.StaticWriter | bufio.BufferWriter {
  bw = writeBlockHeader(bw, block.header)

  bw.writeU16(block.transactions.length)
  for (const transaction of block.transactions) {
    writeTransaction(bw, transaction)
  }

  return bw
}

export function readBlock(reader: bufio.BufferReader): RawBlock {
  const header = readBlockHeader(reader)

  const transactionsLength = reader.readU16()
  const transactions: Transaction[] = []
  for (let j = 0; j < transactionsLength; j++) {
    transactions.push(readTransaction(reader))
  }

  return { header, transactions }
}

export function getBlockSize(block: RawBlock): number {
  let size = getBlockHeaderSize()

  size += BLOCK_TRANSACTIONS_LENGTH_BYTES
  for (const transaction of block.transactions) {
    size += getTransactionSize(transaction)
  }

  return size
}

export function getBlockWithMinersFeeSize(): number {
  return (
    getBlockHeaderSize() + BLOCK_TRANSACTIONS_LENGTH_BYTES + MINERS_FEE_TRANSACTION_SIZE_BYTES
  )
}

export function writeCompactBlock(
  bw: bufio.StaticWriter | bufio.BufferWriter,
  compactBlock: CompactBlock,
): bufio.StaticWriter | bufio.BufferWriter {
  bw = writeBlockHeader(bw, compactBlock.header)

  bw.writeVarint(compactBlock.transactionHashes.length)
  for (const transactionHash of compactBlock.transactionHashes) {
    bw.writeHash(transactionHash)
  }

  bw.writeVarint(compactBlock.transactions.length)
  for (const transaction of compactBlock.transactions) {
    bw.writeVarint(transaction.index)
    writeTransaction(bw, transaction.transaction)
  }

  return bw
}

export function readCompactBlock(reader: bufio.BufferReader): CompactBlock {
  const header = readBlockHeader(reader)

  const transactionHashes: Buffer[] = []
  const transactionHashesLength = reader.readVarint()
  for (let i = 0; i < transactionHashesLength; i++) {
    const transactionHash = reader.readHash()
    transactionHashes.push(transactionHash)
  }

  const transactions: CompactBlockTransaction[] = []
  const transactionsLength = reader.readVarint()
  for (let i = 0; i < transactionsLength; i++) {
    const index = reader.readVarint()
    const transaction = readTransaction(reader)
    transactions.push({ index, transaction })
  }

  return {
    header,
    transactionHashes,
    transactions,
  }
}

export function getCompactBlockSize(compactBlock: CompactBlock): number {
  let size = getBlockHeaderSize()

  size += sizeVarint(compactBlock.transactionHashes.length)
  size += 32 * compactBlock.transactionHashes.length

  size += sizeVarint(compactBlock.transactions.length)
  for (const transaction of compactBlock.transactions) {
    size += sizeVarint(transaction.index)
    size += getTransactionSize(transaction.transaction)
  }

  return size
}

export function writeTransaction(
  bw: bufio.StaticWriter | bufio.BufferWriter,
  transaction: Transaction,
): void {
  bw.writeVarBytes(transaction.serialize())
}

export function readTransaction(reader: bufio.BufferReader): Transaction {
  return new Transaction(reader.readVarBytes())
}

export function getTransactionSize(transaction: Transaction): number {
  return sizeVarBytes(transaction.serialize())
}
