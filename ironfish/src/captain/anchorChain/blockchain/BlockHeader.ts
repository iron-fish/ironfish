/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Strategy from '../strategies'
import Transaction from '../strategies/Transaction'
import { NullifierHash } from '../nullifiers'
import Target, { TargetSerde } from './Target'
import Serde, { BufferSerde, JsonSerializable, IJSON } from '../../../serde'
import { GRAPH_ID_NULL } from '.'

export type BlockHash = Buffer
export type Sequence = bigint
export const ALLOWED_BLOCK_FUTURE_SECONDS = 30

export default class BlockHeader<
  E,
  H,
  T extends Transaction<E, H>,
  SE extends JsonSerializable,
  SH extends JsonSerializable,
  ST
> {
  // Strategy for hashing block and tree nodes and calculating targets
  public strategy: Strategy<E, H, T, SE, SH, ST>

  /**
   * The sequence number of the block. Blocks in a chain increase in ascending
   * order of sequence. More than one block may have the same sequence,
   * indicating a fork in the chain, but only one fork is selected at a time.
   */
  public sequence: Sequence

  /**
   * The hash of the previous block in the chain
   */
  public previousBlockHash: BlockHash

  /**
   * Commitment to the note tree after all new notes from transactions in this
   * block have been added to it. Stored as the hash and the size of the tree
   * at the time the hash was calculated.
   */
  public noteCommitment: { commitment: H; size: number }

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
  public minersFee: BigInt

  /**
   * A 32 byte field that may be assigned at will by the miner who mined the block.
   */
  public graffiti: Buffer

  /**
   * (For internal uses — excluded when sent over the network)
   * Is this block valid. If valid, all blocks before it are also valid
   */
  public isValid: boolean

  /**
   * (For internal uses — excluded when sent over the network)
   * Cumulative work from genesis to this block
   */
  public work: BigInt

  /**
   * (For internal uses — excluded when sent over the network)
   * graphId of GRAPH_ID_NULL (0) indicates no graph has been assigned to a block
   * (should never happen after block has been added)
   */
  public graphId: number

  /**
   * (For internal uses — excluded when sent over the network)
   * the number of blocks pointing to this one
   * (number of next blocks)
   */
  public count: number

  public hash: Buffer

  private bufferSerde: BufferSerde
  private targetSerde: TargetSerde

  constructor(
    strategy: Strategy<E, H, T, SE, SH, ST>,
    sequence: bigint,
    previousBlockHash: BlockHash,
    noteCommitment: { commitment: H; size: number },
    nullifierCommitment: { commitment: NullifierHash; size: number },
    target: Target,
    randomness = 0,
    timestamp: Date | undefined = undefined,
    minersFee: BigInt,
    graffiti: Buffer,
    isValid = false,
    work: BigInt = BigInt(0),
    graphId: number = GRAPH_ID_NULL,
    count = 0,
    hash?: Buffer,
  ) {
    this.targetSerde = new TargetSerde()
    this.bufferSerde = new BufferSerde(32)

    this.strategy = strategy
    this.sequence = sequence
    this.previousBlockHash = previousBlockHash
    this.noteCommitment = noteCommitment
    this.nullifierCommitment = nullifierCommitment
    this.target = target
    this.randomness = randomness
    this.timestamp = timestamp || new Date()
    this.minersFee = minersFee
    this.isValid = isValid
    this.work = work
    this.graphId = graphId
    this.count = count
    this.graffiti = graffiti
    this.hash = hash || this.recomputeHash()
  }

  /**
   * Construct a partial block header without the randomness and convert
   * it to buffer.
   *
   * This is used for calculating the hash in miners and for verifying it.[]
   */
  serializePartial(): Buffer {
    const serialized = {
      sequence: this.sequence.toString(),
      previousBlockHash: this.bufferSerde.serialize(this.previousBlockHash),
      noteCommitment: {
        commitment: this.strategy
          .noteHasher()
          .hashSerde()
          .serialize(this.noteCommitment.commitment),
        size: this.noteCommitment.size,
      },
      nullifierCommitment: {
        commitment: this.strategy
          .nullifierHasher()
          .hashSerde()
          .serialize(this.nullifierCommitment.commitment),
        size: this.nullifierCommitment.size,
      },
      target: this.targetSerde.serialize(this.target),
      timestamp: this.timestamp.getTime(),
      minersFee: this.minersFee.toString(),
      graffiti: this.bufferSerde.serialize(this.graffiti),
    }

    return Buffer.from(IJSON.stringify(serialized))
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

export type SerializedBlockHeader<SH> = {
  sequence: string
  previousBlockHash: string
  noteCommitment: {
    commitment: SH
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

  isValid: boolean
  work: string
  graphId: number
  count: number
  hash: string
  graffiti: string
}

export class BlockHeaderSerde<
  E,
  H,
  T extends Transaction<E, H>,
  SE extends JsonSerializable,
  SH extends JsonSerializable,
  ST
> implements Serde<BlockHeader<E, H, T, SE, SH, ST>, SerializedBlockHeader<SH>> {
  private bufferSerde: BufferSerde
  private targetSerde: TargetSerde
  constructor(readonly strategy: Strategy<E, H, T, SE, SH, ST>) {
    this.strategy = strategy
    this.targetSerde = new TargetSerde()
    this.bufferSerde = new BufferSerde(32)
  }

  equals(
    element1: BlockHeader<E, H, T, SE, SH, ST>,
    element2: BlockHeader<E, H, T, SE, SH, ST>,
  ): boolean {
    return (
      element1.sequence === element2.sequence &&
      this.strategy
        .noteHasher()
        .hashSerde()
        .equals(element1.noteCommitment.commitment, element2.noteCommitment.commitment) &&
      element1.noteCommitment.size === element2.noteCommitment.size &&
      this.strategy
        .nullifierHasher()
        .hashSerde()
        .equals(
          element1.nullifierCommitment.commitment,
          element2.nullifierCommitment.commitment,
        ) &&
      element1.nullifierCommitment.size === element2.nullifierCommitment.size &&
      this.targetSerde.equals(element1.target, element2.target) &&
      element1.randomness === element2.randomness &&
      element1.timestamp.getTime() === element2.timestamp.getTime() &&
      element1.minersFee === element2.minersFee &&
      element1.graffiti.equals(element2.graffiti)
    )
  }

  serialize(header: BlockHeader<E, H, T, SE, SH, ST>): SerializedBlockHeader<SH> {
    const serialized = {
      sequence: header.sequence.toString(),
      previousBlockHash: this.bufferSerde.serialize(header.previousBlockHash),
      noteCommitment: {
        commitment: this.strategy
          .noteHasher()
          .hashSerde()
          .serialize(header.noteCommitment.commitment),
        size: header.noteCommitment.size,
      },
      nullifierCommitment: {
        commitment: this.strategy
          .nullifierHasher()
          .hashSerde()
          .serialize(header.nullifierCommitment.commitment),
        size: header.nullifierCommitment.size,
      },
      target: this.targetSerde.serialize(header.target),
      randomness: header.randomness,
      timestamp: header.timestamp.getTime(),
      minersFee: header.minersFee.toString(),
      isValid: header.isValid,
      work: header.work.toString(),
      graphId: header.graphId,
      count: header.count,
      hash: this.bufferSerde.serialize(header.hash),
      graffiti: this.bufferSerde.serialize(header.graffiti),
    }

    return serialized
  }

  deserialize(data: SerializedBlockHeader<SH>): BlockHeader<E, H, T, SE, SH, ST> {
    // TODO: this needs to make assertions on the data format
    // as it can be from untrusted sources
    const header = new BlockHeader(
      this.strategy,
      BigInt(data.sequence),
      Buffer.from(this.bufferSerde.deserialize(data.previousBlockHash)),
      {
        commitment: this.strategy
          .noteHasher()
          .hashSerde()
          .deserialize(data.noteCommitment.commitment),
        size: data.noteCommitment.size,
      },
      {
        commitment: this.strategy
          .nullifierHasher()
          .hashSerde()
          .deserialize(data.nullifierCommitment.commitment),
        size: data.nullifierCommitment.size,
      },
      this.targetSerde.deserialize(data.target),
      data.randomness,
      new Date(data.timestamp),
      BigInt(data.minersFee),
      Buffer.from(this.bufferSerde.deserialize(data.graffiti)),
      data.isValid,
      data.work ? BigInt(data.work) : BigInt(0),
      data.graphId,
      data.count,
      Buffer.from(this.bufferSerde.deserialize(data.hash)),
    )

    return header
  }
}
