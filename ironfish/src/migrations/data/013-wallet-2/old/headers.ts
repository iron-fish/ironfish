/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { IDatabaseEncoding } from '../../../../storage/database/types'
import bufio from 'bufio'
import { Assert } from '../../../../assert'
import { BlockHash, hashBlockHeader } from '../../../../primitives/blockheader'
import { NoteEncryptedHash } from '../../../../primitives/noteEncrypted'
import { NullifierHash } from '../../../../primitives/nullifier'
import { Target } from '../../../../primitives/target'
import { IDatabaseStore } from '../../../../storage'
import { BigIntUtils } from '../../../../utils/bigint'

export type HeadersStore = IDatabaseStore<{ key: Buffer; value: HeaderValue }>

export type HeaderValue = {
  header: BlockHeader
}

class PartialBlockHeaderSerde {
  static serialize(header: PartialBlockHeader): Buffer {
    const bw = bufio.write(200)
    // TODO: change sequence to u32. expiration_sequence is u32 on transactions, and we're not
    // likely to overflow for a long time.
    bw.writeU64(header.sequence)
    bw.writeHash(header.previousBlockHash)
    bw.writeHash(header.noteCommitment.commitment)
    // TODO: change commitment size to u32. tree_size on spend proofs is
    // a u32, and our merkle trees have depth of 32.
    bw.writeU64(header.noteCommitment.size)
    bw.writeHash(header.nullifierCommitment.commitment)
    // TODO: change commitment size to u32. tree_size on spend proofs is
    // a u32, and our merkle trees have depth of 32.
    bw.writeU64(header.nullifierCommitment.size)
    // TODO: Change to little-endian for consistency, since other non-bigint numbers are serialized as little-endian.
    bw.writeBytes(BigIntUtils.toBytesBE(header.target.asBigInt(), 32))
    bw.writeU64(header.timestamp.getTime())
    // TODO: Change to little-endian for consistency, since other non-bigint numbers are serialized as little-endian.
    bw.writeBytes(BigIntUtils.toBytesBE(header.minersFee, 8))
    bw.writeBytes(header.graffiti)
    return bw.render()
  }

  static deserialize(data: Buffer): PartialBlockHeader {
    const br = bufio.read(data)
    const sequence = br.readU64()
    const previousBlockHash = br.readHash()
    const noteCommitment = br.readHash()
    const noteCommitmentSize = br.readU64()
    const nullifierCommitment = br.readHash()
    const nullifierCommitmentSize = br.readU64()
    const target = br.readBytes(32)
    const timestamp = br.readU64()
    const minersFee = br.readBytes(8)
    const graffiti = br.readBytes(32)

    return {
      sequence: sequence,
      previousBlockHash: previousBlockHash,
      target: new Target(target),
      timestamp: new Date(timestamp),
      minersFee: BigIntUtils.fromBytes(minersFee),
      graffiti: graffiti,
      noteCommitment: {
        commitment: noteCommitment,
        size: noteCommitmentSize,
      },
      nullifierCommitment: {
        commitment: nullifierCommitment,
        size: nullifierCommitmentSize,
      },
    }
  }

  static equals(): boolean {
    throw new Error('You should never use this')
  }
}

export type PartialBlockHeader = {
  sequence: number
  previousBlockHash: Buffer
  noteCommitment: {
    commitment: NoteEncryptedHash
    size: number
  }
  nullifierCommitment: {
    commitment: NullifierHash
    size: number
  }
  target: Target
  timestamp: Date
  minersFee: bigint
  graffiti: Buffer
}

class BlockHeader {
  /**
   * The sequence number of the block. Blocks in a chain increase in ascending
   * order of sequence. More than one block may have the same sequence,
   * indicating a fork in the chain, but only one fork is selected at a time.
   */
  public sequence: number

  /**
   * The hash of the previous block in the chain
   */
  public previousBlockHash: BlockHash

  /**
   * Commitment to the note tree after all new notes from transactions in this
   * block have been added to it. Stored as the hash and the size of the tree
   * at the time the hash was calculated.
   */
  public noteCommitment: { commitment: NoteEncryptedHash; size: number }

  /**
   * Commitment to the nullifier set after all the spends in this block have
   * been added to it. Stored as the nullifier hash and the size of the set
   * at the time the hash was calculated.
   */
  public nullifierCommitment: { commitment: NullifierHash; size: number }

  /**
   * The hash of the block must be lower than this target value in order for
   * the blocks to be accepted on the chain. Essentially a numerical comparison
   * of a very big integer.
   */
  public target: Target

  /**
   * A value added to the block to try to make it hash to something that is below
   * the target number.
   */
  public randomness: bigint

  /**
   * Unix timestamp according to the miner who mined the block. This value
   * must be taken with a grain of salt, but miners must verify that it is an
   * appropriate distance to the previous blocks timestamp.
   *
   * TODO: this is called timestamp but it's not a timestamp, it's a date.
   * Fix this to be a timestamp or rename it
   */
  public timestamp: Date

  /**
   * A single transaction representing the miner's fee, awarded to the successful
   * miner for mining the block plus the transaction fees offered by spending users.
   * This is the only way inflation happens on the chain.
   *
   * Note that the transaction fee on a minersFee is negative. By "spending a negative value"
   * the miner is awarding itself a positive output.
   */
  public minersFee: bigint

  /**
   * A 32 byte field that may be assigned at will by the miner who mined the block.
   */
  public graffiti: Buffer

  /**
   * (For internal uses — excluded when sent over the network)
   * Cumulative work from genesis to this block
   */
  public work: bigint

  public hash: Buffer

  constructor(
    sequence: number,
    previousBlockHash: BlockHash,
    noteCommitment: { commitment: NoteEncryptedHash; size: number },
    nullifierCommitment: { commitment: NullifierHash; size: number },
    target: Target,
    randomness = BigInt(0),
    timestamp: Date | undefined = undefined,
    minersFee: bigint,
    graffiti: Buffer,
    work = BigInt(0),
    hash?: Buffer,
  ) {
    this.sequence = sequence
    this.previousBlockHash = previousBlockHash
    this.noteCommitment = noteCommitment
    this.nullifierCommitment = nullifierCommitment
    this.target = target
    this.randomness = randomness
    this.timestamp = timestamp || new Date()
    this.minersFee = minersFee
    this.work = work
    this.graffiti = graffiti
    this.hash = hash || this.recomputeHash()
  }

  /**
   * Construct a partial block header without the randomness and convert
   * it to buffer.
   *
   * This is used for calculating the hash in miners and for verifying it.
   */
  serializePartial(): Buffer {
    return PartialBlockHeaderSerde.serialize({
      sequence: this.sequence,
      previousBlockHash: this.previousBlockHash,
      noteCommitment: this.noteCommitment,
      nullifierCommitment: this.nullifierCommitment,
      target: this.target,
      timestamp: this.timestamp,
      minersFee: this.minersFee,
      graffiti: this.graffiti,
    })
  }

  /**
   * Hash all the values in the block header to get a commitment to the entire
   * header and the global trees it models.
   */
  recomputeHash(): BlockHash {
    const partialHeader = this.serializePartial()

    const headerBytes = Buffer.alloc(partialHeader.byteLength + 8)
    headerBytes.set(BigIntUtils.toBytesBE(this.randomness, 8))
    headerBytes.set(partialHeader, 8)

    const hash = hashBlockHeader(headerBytes)
    this.hash = hash
    return hash
  }
  /**
   * Check whether the hash of this block is less than the target stored
   * within the block header. This is the primary proof of work function.
   *
   * Hashes cannot be predicted, and the only way to find one that is lower
   * than the target that is inside it is to tweak the randomness number
   * repeatedly.
   */
  verifyTarget(): boolean {
    return Target.meets(new Target(this.recomputeHash()).asBigInt(), this.target)
  }
}

export class HeaderEncoding implements IDatabaseEncoding<HeaderValue> {
  serialize(value: HeaderValue): Buffer {
    const bw = bufio.write(this.getSize(value))

    bw.writeU32(value.header.sequence)
    bw.writeHash(value.header.previousBlockHash)
    bw.writeHash(value.header.noteCommitment.commitment)
    bw.writeU32(value.header.noteCommitment.size)
    bw.writeHash(value.header.nullifierCommitment.commitment)
    bw.writeU32(value.header.nullifierCommitment.size)
    bw.writeBytes(BigIntUtils.toBytesLE(value.header.target.asBigInt(), 32))
    bw.writeBytes(BigIntUtils.toBytesLE(value.header.randomness, 8))
    bw.writeU64(value.header.timestamp.getTime())

    Assert.isTrue(value.header.minersFee <= 0)
    bw.writeBytes(BigIntUtils.toBytesLE(-value.header.minersFee, 8))

    bw.writeBytes(value.header.graffiti)
    bw.writeVarBytes(BigIntUtils.toBytesLE(value.header.work))
    bw.writeHash(value.header.hash)

    return bw.render()
  }

  deserialize(data: Buffer): HeaderValue {
    const reader = bufio.read(data, true)

    const sequence = reader.readU32()
    const previousBlockHash = reader.readHash()
    const noteCommitment = reader.readHash()
    const noteCommitmentSize = reader.readU32()
    const nullifierCommitment = reader.readHash()
    const nullifierCommitmentSize = reader.readU32()
    const target = new Target(BigIntUtils.fromBytesLE(reader.readBytes(32)))
    const randomness = BigIntUtils.fromBytesLE(reader.readBytes(8))
    const timestamp = reader.readU64()
    const minersFee = -BigIntUtils.fromBytesLE(reader.readBytes(8))
    const graffiti = reader.readBytes(32)
    const work = BigIntUtils.fromBytesLE(reader.readVarBytes())
    const hash = reader.readHash()

    const header = new BlockHeader(
      sequence,
      previousBlockHash,
      {
        commitment: noteCommitment,
        size: noteCommitmentSize,
      },
      {
        commitment: nullifierCommitment,
        size: nullifierCommitmentSize,
      },
      target,
      randomness,
      new Date(timestamp),
      minersFee,
      graffiti,
      work,
      hash,
    )

    return { header }
  }

  getSize(value: HeaderValue): number {
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
    size += bufio.sizeVarBytes(BigIntUtils.toBytesLE(value.header.work))
    size += 32 // hash

    return size
  }
}
