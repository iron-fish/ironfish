/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { MerkleHasher } from '../merkleTree'
import { NullifierHash, Nullifier } from '../nullifiers'
import { BlockHash } from '../blockchain/BlockHeader'
import Transaction from './Transaction'
import Serde, { JsonSerializable } from '../../../serde'
import Verifier from '../../Verifier'
import Blockchain from '../blockchain'

export { default as Transaction, Spend } from './Transaction'

/**
 * Strategy to allow anchor chain to remain
 * generic across computations.
 * Methods give access to the hasher and nullifier hasher
 * and custom calculations for block hash, target,
 * and miner's fee.
 */
export default interface Strategy<
  E,
  H,
  T extends Transaction<E, H>,
  SE extends JsonSerializable,
  SH extends JsonSerializable,
  ST
> {
  /**
   * Create a verifier used to validate conensus
   */
  createVerifier(chain: Blockchain<E, H, T, SE, SH, ST>): Verifier<E, H, T, SE, SH, ST>

  /**
   * Get the hasher used to calculate hashes of notes in the tree.
   */
  noteHasher(): MerkleHasher<E, H, SE, SH>

  /**
   * Get the hasher used to calculate hashes of nullifiers. Note that you
   * probably want to use a NullifierHasher here.
   */
  nullifierHasher(): MerkleHasher<Nullifier, NullifierHash, string, string>

  /**
   * Get the object that can serialize and deserialize lists of transactions.
   */
  transactionSerde(): Serde<T, ST>

  /**
   * Given the serialized bytes of a block header, return a 32-byte hash of that block.
   *
   * Note: in Ironfish, the hashing algorithm is hard-coded into the mining thread,
   * and hashBlockHeader must always return the result of miningAlgorithm.hashBlockHeader.
   *
   * Ideally we could remove this method altogether, but unit tests rely
   * on it heavily.
   */
  hashBlockHeader(header: Buffer): BlockHash

  /**
   * Create the miner's fee transaction for a given block.
   *
   * The miner's fee is a special transaction with one receipt and
   * zero spends. It's receipt value must be the total transaction fees
   * in the block plus the mining reward for the block.
   *
   * The mining reward may change over time, so we accept the block sequence
   * to calculate the mining reward from.
   *
   * @param totalTransactionFees is the sum of the transaction fees intended to go
   * in this block.
   * @param blockSequence the sequence of the block for which the miner's fee is being created
   * @param minerKey the spending key for the miner.
   */
  createMinersFee(
    totalTransactionFees: bigint,
    blockSequence: bigint,
    minerKey: string,
  ): Promise<T>

  /**
   * Calculate the mining reward for a block based on its sequence
   */
  miningReward(blockSequence: bigint): number
}
