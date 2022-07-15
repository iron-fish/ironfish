/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { Assert } from '../../assert'
import { SerializedBlock } from '../../primitives/block'
import { SerializedBlockHeader } from '../../primitives/blockheader'
import { GraffitiSerdeInstance } from '../../serde/serdeInstances'
import { BigIntUtils } from '../../utils/bigint'

export function writeBlockHeader(
  bw: bufio.StaticWriter | bufio.BufferWriter,
  header: SerializedBlockHeader,
): bufio.StaticWriter | bufio.BufferWriter {
  bw.writeU32(header.sequence)
  bw.writeHash(header.previousBlockHash)
  bw.writeHash(header.noteCommitment.commitment)
  bw.writeU32(header.noteCommitment.size)
  bw.writeHash(header.nullifierCommitment.commitment)
  bw.writeU32(header.nullifierCommitment.size)
  bw.writeBytes(BigIntUtils.toBytesLE(BigInt(header.target), 32))
  bw.writeBytes(BigIntUtils.toBytesLE(BigInt(header.randomness), 8))
  bw.writeU64(header.timestamp)

  Assert.isTrue(BigInt(header.minersFee) <= 0)
  bw.writeBytes(BigIntUtils.toBytesLE(-BigInt(header.minersFee), 8))

  bw.writeBytes(GraffitiSerdeInstance.deserialize(header.graffiti))
  return bw
}

export function writeBlock(
  bw: bufio.StaticWriter | bufio.BufferWriter,
  block: SerializedBlock,
): bufio.StaticWriter | bufio.BufferWriter {
  bw = writeBlockHeader(bw, block.header)

  bw.writeU16(block.transactions.length)
  for (const transaction of block.transactions) {
    bw.writeVarBytes(transaction)
  }

  return bw
}

export function readBlockHeader(reader: bufio.BufferReader): SerializedBlockHeader {
  const sequence = reader.readU32()
  const previousBlockHash = reader.readHash('hex')
  const noteCommitment = reader.readHash()
  const noteCommitmentSize = reader.readU32()
  const nullifierCommitment = reader.readHash('hex')
  const nullifierCommitmentSize = reader.readU32()
  const target = BigIntUtils.fromBytesLE(reader.readBytes(32)).toString()
  const randomness = BigIntUtils.fromBytesLE(reader.readBytes(8)).toString()
  const timestamp = reader.readU64()
  const minersFee = (-BigIntUtils.fromBytesLE(reader.readBytes(8))).toString()
  const graffiti = GraffitiSerdeInstance.serialize(reader.readBytes(32))

  return {
    sequence,
    previousBlockHash,
    noteCommitment: {
      commitment: noteCommitment,
      size: noteCommitmentSize,
    },
    nullifierCommitment: {
      commitment: nullifierCommitment,
      size: nullifierCommitmentSize,
    },
    target,
    randomness,
    timestamp,
    minersFee,
    graffiti,
  }
}

export function readBlock(reader: bufio.BufferReader): SerializedBlock {
  const header = readBlockHeader(reader)

  const transactionsLength = reader.readU16()
  const transactions = []
  for (let j = 0; j < transactionsLength; j++) {
    transactions.push(reader.readVarBytes())
  }

  return {
    header,
    transactions,
  }
}

export function getBlockHeaderSize(): number {
  let size = 0
  size += 4 // sequence
  size += 32 // previousBlockHash
  size += 32 // noteCommitment.commitment
  size += 4 // noteCommitment.size
  size += 32 // nullifierCommitment.commitment
  size += 4 // nullifierCommitment.size
  size += 32 // target
  size += 8 // randomness
  size += 8 // timestamp
  size += 8 // minersFee
  size += 32 // graffiti
  return size
}

export function getBlockSize(block: SerializedBlock): number {
  let size = getBlockHeaderSize()

  size += 2 // transactions length
  for (const transaction of block.transactions) {
    size += bufio.sizeVarBytes(transaction)
  }

  return size
}
