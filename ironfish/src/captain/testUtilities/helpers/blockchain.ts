/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { SerializedTestTransaction, TestStrategy, TestTransaction } from '../strategy'
import Blockchain from '../../anchorChain/blockchain'
import Block from '../../anchorChain/blockchain/Block'
import BlockHeader, { BlockHash } from '../../anchorChain/blockchain/BlockHeader'
import Target from '../../anchorChain/blockchain/Target'
import { makeDb, makeDbName } from './storage'
import { RangeHasher } from '../../anchorChain/merkleTree'
import { createRootLogger } from '../../../logger'

/**
 * Make a block with a hash consisting of the given digit,
 * the previous hash consisting of the next digit, and the start and
 * end numbers of a sequence of notes in the block.
 *
 * Note: The resulting block is suitable for use on a blockchain.BlockChain,
 * but will fail if you try adding it to an anchorchain without some extra
 * massaging of the values.
 *
 * Specifically, the nullifier commitment does not have a correct value against
 * the value in the tree. The note commitment should match up, though it depends
 * exactly how the tree was initially produced.
 *
 * Most notably, a block created with this function will not go onto a chain
 * created with makeChain or makeCaptain. You are probably better off using
 * makeNextBlock from the anchorChain test utilities instead.
 */
export function makeFakeBlock(
  strategy: TestStrategy,
  previousHash: BlockHash,
  hash: BlockHash,
  sequence: number,
  start: number,
  end: number,
  timestamp?: Date,
): Block<string, string, TestTransaction, string, string, SerializedTestTransaction> {
  const transactions = []
  for (let i = start; i < end; i++) {
    transactions.push(new TestTransaction(true, [String(i)], 1))
  }

  const minersReward = strategy.miningReward(BigInt(sequence))
  const transactionFee = -1 * (end - start + minersReward)
  const transactionFeeTransaction = new TestTransaction(true, [String(end)], transactionFee)
  transactions.push(transactionFeeTransaction)

  const graffiti = Buffer.alloc(32)
  graffiti.write('fake block')

  const header = new BlockHeader(
    strategy,
    BigInt(sequence),
    previousHash,
    {
      commitment: `1-${end}`,
      size: end,
    },
    { commitment: Buffer.alloc(32), size: 1 },
    fakeMaxTarget(),
    0,
    timestamp ? timestamp : new Date(1598970000000 + hash[0]),
    BigInt(transactionFee),
    graffiti,
  )

  return new Block(header, transactions)
}

/**
 * Make a block hash with the hash set to the given digit
 */
export function fakeMaxTarget(): Target {
  return new Target(BigInt(2) ** BigInt(256) - BigInt(1))
}

/**
 * Make a block hash with the hash set to the given digit
 */
export function blockHash(digit: number): BlockHash {
  const hash = Buffer.alloc(32)
  hash[0] = digit
  return hash
}

/**
 * Make a nullifier with the hash set to the given digit.
 */
export function makeNullifier(digit: number): BlockHash {
  const hash = Buffer.alloc(32)
  hash[0] = digit
  return hash
}

export async function makeBlockchain(): Promise<
  Blockchain<
    string,
    string,
    TestTransaction<string>,
    string,
    string,
    SerializedTestTransaction<string>
  >
> {
  const name = makeDbName()
  const database = makeDb(name)

  const strategy = new TestStrategy(new RangeHasher())
  const chain = await Blockchain.new(database, strategy, createRootLogger())

  await database.open()
  return chain
}
