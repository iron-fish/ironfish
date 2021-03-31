/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { BlockHash } from '../../anchorChain/blockchain/BlockHeader'
import { NullifierHasher } from '../../anchorChain/nullifiers'
import Strategy from '../../anchorChain/strategies'
import { ConcatHasher } from '../../anchorChain/merkleTree'

import { TestTransaction } from './TestTransaction'
import { TestTransactionSerde } from './TestTransactionSerde'
import { SerializedTestTransaction } from './SerializedTypes'
import { TestVerifier } from './testVerifier'
import { TestBlockchain } from '../helpers'

/**
 * Very basic strategy for testing blockchain code. Models notes and hashes
 * as concatenated strings, and uses dumb calculations for hashing and
 * target calculations
 */
export class TestStrategy
  implements
    Strategy<string, string, TestTransaction, string, string, SerializedTestTransaction> {
  _noteHasher: ConcatHasher
  _nullifierHasher: NullifierHasher

  constructor(noteHasher = new ConcatHasher()) {
    this._noteHasher = noteHasher
    this._nullifierHasher = new NullifierHasher()
  }

  createVerifier(chain: TestBlockchain): TestVerifier {
    return new TestVerifier(chain)
  }

  noteHasher(): ConcatHasher {
    return this._noteHasher
  }

  nullifierHasher(): NullifierHasher {
    return this._nullifierHasher
  }

  transactionSerde(): TestTransactionSerde {
    return new TestTransactionSerde()
  }

  /**
   * Generate a hash from the block's sequence.
   */
  hashBlockHeader(serializedHeader: Buffer): BlockHash {
    const headerWithoutRandomness = Buffer.from(serializedHeader.slice(8))
    const header = JSON.parse(headerWithoutRandomness.toString()) as Record<string, unknown>

    const sequence = BigInt(header['sequence'])
    const bigIntArray = BigInt64Array.from([sequence])
    const byteArray = Buffer.from(bigIntArray.buffer)
    const result = Buffer.alloc(32)
    result.set(byteArray)
    return result
  }

  createMinersFee(
    totalTransactionFees: bigint,
    blockSequence: bigint,
    _minerKey: string,
  ): Promise<TestTransaction> {
    const miningReward = this.miningReward(blockSequence)
    return Promise.resolve(
      new TestTransaction(
        true,
        [`miners note ${totalTransactionFees + BigInt(miningReward)}`],
        BigInt(-1) * (totalTransactionFees + BigInt(miningReward)),
        [],
      ),
    )
  }

  miningReward(_blockSequence: bigint): number {
    return 10
  }
}
