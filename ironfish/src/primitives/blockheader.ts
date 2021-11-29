/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import bufio from 'bufio'
import { BlockHashSerdeInstance, GraffitiSerdeInstance, Serde } from '../serde'
import { Strategy } from '../strategy'
import { NoteEncryptedHash, SerializedNoteEncryptedHash } from './noteEncrypted'
import { NullifierHash } from './nullifier'
import { Target } from './target'

export type BlockHash = Buffer

import { createHash } from 'blake3-wasm'
import { BigIntUtils } from '..'
import PartialBlockHeaderSerde from '../serde/PartialHeaderSerde'

export function hashBlockHeader(serializedHeader: Buffer): BlockHash {
  const hash = createHash()
  hash.update(serializedHeader)
  return hash.digest()
}

export function isBlockLater(a: BlockHeader, b: BlockHeader): boolean {
  if (a.sequence !== b.sequence) {
    return a.sequence > b.sequence
  }

  return a.hash < b.hash
}

export function isBlockHeavier(a: BlockHeader, b: BlockHeader): boolean {
  if (a.work !== b.work) {
    return a.work > b.work
  }

  if (a.sequence !== b.sequence) {
    return a.sequence > b.sequence
  }

  if (a.target.toDifficulty() !== b.target.toDifficulty()) {
    return a.target.toDifficulty() > b.target.toDifficulty()
  }

  return a.hash < b.hash
}

export class BlockHeader {
  // Strategy for hashing block and tree nodes and calculating targets
  public strategy: Strategy

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
  public randomness: number

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
   * the miner is awarding itself a positive receipt.
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
    strategy: Strategy,
    sequence: number,
    previousBlockHash: BlockHash,
    noteCommitment: { commitment: NoteEncryptedHash; size: number },
    nullifierCommitment: { commitment: NullifierHash; size: number },
    target: Target,
    randomness = 0,
    timestamp: Date | undefined = undefined,
    minersFee: bigint,
    graffiti: Buffer,
    work = BigInt(0),
    hash?: Buffer,
  ) {
    this.strategy = strategy
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
    return new PartialBlockHeaderSerde().serialize({
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
    const randomnessBytes = new ArrayBuffer(8)
    new DataView(randomnessBytes).setFloat64(0, this.randomness, false)
    const headerBytes = Buffer.concat([Buffer.from(randomnessBytes), this.serializePartial()])
    const hash = this.strategy.hashBlockHeader(headerBytes)
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

export type SerializedBlockHeader = {
  sequence: number
  previousBlockHash: string
  noteCommitment: {
    commitment: SerializedNoteEncryptedHash
    size: number
  }
  nullifierCommitment: {
    commitment: string
    size: number
  }
  target: string
  randomness: number
  timestamp: number
  minersFee: string

  work: string
  hash: string
  graffiti: string
}

export class BlockHeaderSerde implements Serde<BlockHeader, Buffer> {
  constructor(readonly strategy: Strategy) {}

  equals(element1: BlockHeader, element2: BlockHeader): boolean {
    return (
      element1.sequence === element2.sequence &&
      this.strategy.noteHasher
        .hashSerde()
        .equals(element1.noteCommitment.commitment, element2.noteCommitment.commitment) &&
      element1.noteCommitment.size === element2.noteCommitment.size &&
      this.strategy.nullifierHasher
        .hashSerde()
        .equals(
          element1.nullifierCommitment.commitment,
          element2.nullifierCommitment.commitment,
        ) &&
      element1.nullifierCommitment.size === element2.nullifierCommitment.size &&
      element1.target.equals(element2.target) &&
      element1.randomness === element2.randomness &&
      element1.timestamp.getTime() === element2.timestamp.getTime() &&
      element1.minersFee === element2.minersFee &&
      element1.graffiti.equals(element2.graffiti)
    )
  }

  serialize(header: BlockHeader): Buffer {
    const bw = bufio.write()
    bw.writeU64(header.sequence)
    bw.writeHash(header.previousBlockHash)
    bw.writeHash(header.noteCommitment.commitment)
    bw.writeU64(header.noteCommitment.size)
    bw.writeHash(header.nullifierCommitment.commitment)
    bw.writeU64(header.nullifierCommitment.size)
    bw.writeBytes(BigIntUtils.toBytesBE(header.target.asBigInt(), 32))
    bw.writeU64(header.randomness)
    bw.writeU64(header.timestamp.getTime())
    bw.writeBytes(BigIntUtils.toBytesBE(BigInt.asIntN(64,header.minersFee), 32))
    bw.writeVarBytes(header.graffiti)
    bw.writeVarBytes(BigIntUtils.toBytes(header.work))
    bw.writeHash(header.hash)
    return bw.render()
  }

  deserialize(data: Buffer): BlockHeader {
    // TODO: this needs to make assertions on the data format
    // as it can be from untrusted sources
    const br = bufio.read(data)
    const sequence = br.readU64()
    const previousBlockHash = br.readHash()
    const noteCommitment = br.readHash()
    const noteCommitmentSize = br.readU64()
    const nullifierCommitment = br.readHash()
    const nullifierCommitmentSize = br.readU64()
    const target = br.readBytes(32)
    const randomness = br.readU64()
    const timestamp = br.readU64()
    const minersFee = br.readBytes(32)
    const graffiti = br.readVarBytes()
    const work = br.readVarBytes()
    const hash = br.readHash()
    const header = new BlockHeader(
      this.strategy,
      Number(sequence),
      previousBlockHash,
      {
        commitment: noteCommitment,
        size: noteCommitmentSize,
      },
      {
        commitment: nullifierCommitment,
        size: nullifierCommitmentSize,
      },
      new Target(target),
      randomness,
      new Date(timestamp),
      BigIntUtils.fromBytes(minersFee),
      graffiti,
      BigIntUtils.fromBytes(work),
      hash,
    )
    return header
  }
}
