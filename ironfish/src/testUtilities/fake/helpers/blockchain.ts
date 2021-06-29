/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Assert } from '../../../assert'
import { Blockchain } from '../../../blockchain'
import { GENESIS_BLOCK_PREVIOUS } from '../../../consensus'
import { RangeHasher } from '../../../merkletree'
import { Block } from '../../../primitives/block'
import { BlockHash, BlockHeader } from '../../../primitives/blockheader'
import { Target } from '../../../primitives/target'
import { Spend } from '../../../primitives/transaction'
import { Strategy } from '../../../strategy'
import { makeDbName, makeDbPath } from '../../helpers/storage'
import {
  SerializedTestTransaction,
  TestBlockchain,
  TestStrategy,
  TestTransaction,
} from '../strategy'

/**
 * Add the notes directly to the Blockchain's notes merkle tree
 * without doing any of the checking or syncing that would happen in
 * `Blockchain.addNote`
 */
export async function addNotes(
  blockchain: Blockchain<
    string,
    string,
    TestTransaction,
    string,
    string,
    SerializedTestTransaction
  >,
  notes: number[],
): Promise<void> {
  for (const note of notes) {
    await blockchain.notes.add(`${note}`)
  }
}

/**
 * Set the note and nullifier commitments of the given block to the size and root
 * hash of the notes and nullifiers trees on the given chain.
 *
 * There is a chance this functionality could be useful for more than testing.
 * It could be moved to a method on Blockchain.
 */
export async function syncCommitments(
  header: BlockHeader<
    string,
    string,
    TestTransaction,
    string,
    string,
    SerializedTestTransaction
  >,
  blockchain: Blockchain<
    string,
    string,
    TestTransaction,
    string,
    string,
    SerializedTestTransaction
  >,
): Promise<void> {
  header.noteCommitment.size = await blockchain.notes.size()
  header.noteCommitment.commitment = await blockchain.notes.rootHash()
  header.nullifierCommitment.size = await blockchain.nullifiers.size()
  header.nullifierCommitment.commitment = await blockchain.nullifiers.rootHash()
}

/**
 * Make a block that suits the two trees currently on the chain. All notes/nullifiers
 * that were added to the Blockchain (using chain.notes.add, not chain.AddNote)
 * since the head of the chain are entered as transactions
 * into the fake block. The last note in the tree becomes the miner's fee.
 * The hash and previous hash are all derived from the height.
 *
 * Warning: This will not work if you don't add at least one note to the blockchain
 * using chain.notes.add.
 *
 * This is kind of a strange workflow, but it's the easiest way to make a chain
 * of consistent blocks:
 *  *  Add several notes and nullifiers directly to the chain (chain.notes.add)
 *  *  Call makeNextBlock to get a block that matches those trees
 *  *  add the new block to the chain
 */
export async function makeNextBlock(
  chain: Blockchain<string, string, TestTransaction, string, string, SerializedTestTransaction>,
  isGenesis?: boolean,
  oldNoteCount?: number,
  oldNullifierCount?: number,
): Promise<Block<string, string, TestTransaction, string, string, SerializedTestTransaction>> {
  const noteCount = await chain.notes.size()
  const noteHash = await chain.notes.rootHash()
  const nullifierCount = await chain.nullifiers.size()
  const nullifierHash = await chain.nullifiers.rootHash()

  let newHeight = 1
  let previousBlockHash

  if (isGenesis) {
    newHeight = 1
    oldNoteCount = 0
    oldNullifierCount = 0
    previousBlockHash = GENESIS_BLOCK_PREVIOUS
  } else {
    const head = chain.head
    newHeight = Number(head.height) + 1
    oldNoteCount = oldNoteCount ? oldNoteCount : head.noteCommitment.size
    oldNullifierCount = oldNullifierCount ? oldNullifierCount : head.nullifierCommitment.size
    previousBlockHash = head.hash
  }

  const notes: string[] = []
  const spends: Spend<string>[] = []
  for (let i = oldNoteCount; i < noteCount; i++) {
    const note = await chain.notes.get(i)
    Assert.isNotNull(note, 'makeNextBlock method requires adding notes to tree ahead of time')
    notes.push(note)
  }
  for (let i = oldNullifierCount; i < nullifierCount; i++) {
    const nullifier = await chain.nullifiers.get(i)
    Assert.isNotNull(
      nullifier,
      'makeNextBlock method requires adding nullifier to tree ahead of time',
    )
    spends.push({ nullifier, commitment: noteHash, size: noteCount })
  }

  const minersFee = BigInt(-10)
  const minerTransaction = new TestTransaction(true, notes, minersFee, spends)
  const graffiti = Buffer.alloc(32)
  graffiti.write('fake block')

  const newHeader = new BlockHeader(
    chain.strategy,
    newHeight,
    previousBlockHash,
    {
      size: noteCount,
      commitment: noteHash,
    },
    {
      size: nullifierCount,
      commitment: nullifierHash,
    },
    fakeMaxTarget(),
    0,
    new Date(1598970000000 + Number(newHeight)),
    minersFee,
    graffiti,
  )

  return new Block(newHeader, [minerTransaction])
}

/**
 * Make a blockchain with a genesis block.
 */
export async function makeChainInitial(
  strategy?: Strategy<
    string,
    string,
    TestTransaction,
    string,
    string,
    SerializedTestTransaction
  >,
  options: {
    autoSeed?: boolean
    dbPrefix?: string
  } = {},
): Promise<TestBlockchain> {
  const chain = new Blockchain({
    location: makeDbPath(options.dbPrefix),
    strategy: strategy || new TestStrategy(new RangeHasher()),
    autoSeed: options.autoSeed,
  })

  await chain.db.open()
  await chain.notes.upgrade()
  await chain.nullifiers.upgrade()

  return chain
}

/**
 * Make a blockchain with a genesis block and one additional block that has one note and one nullifier.
 */
export async function makeChainGenesis(
  strategy?: Strategy<
    string,
    string,
    TestTransaction,
    string,
    string,
    SerializedTestTransaction
  >,
  options: {
    dbPrefix?: string
    autoSeed?: boolean
  } = {},
): Promise<TestBlockchain> {
  const chain = await makeChainInitial(strategy, options)
  await chain.notes.add('0')
  await chain.nullifiers.add(makeNullifier(0))
  const genesis = await makeNextBlock(chain, true)
  await chain.addBlock(genesis)
  return chain
}

/**
 * Make a blockchain with several valid blocks,
 * notes, and nullifiers.
 *
 * The chain has eight blocks. Each block is valid and contains five notes,
 * including the miner's fee note. Each block has two spends.
 *
 * Each block is sequentially one after the other and the chain is complete.
 *
 * The easiest way to add new blocks to a chain generated this way is to:
 *
 *  * Add at least one note to the chain using `chain.notes.add()`
 *    (NOT `chain.addNote`) so it doesn't try to sync anything.
 *  * Optionally add some nullifiers to the chain using `chain.nullifiers.add()`
 *  * call `makeNextBlock(chain)` on the chain
 *  * Add the resulting block
 *
 * Not useful for testing forks or validity, but useful for any tests that
 * require a prior existing chain.
 *
 * Can also be useful to pull valid blocks from if you are constructing a
 * second chain. For example, you might want to test optimistic sync by creating
 * a chain with only the last block in this test chain.
 */
export async function makeChainFull(
  strategy?: Strategy<
    string,
    string,
    TestTransaction,
    string,
    string,
    SerializedTestTransaction
  >,
  options: {
    dbPrefix?: string
    autoSeed?: boolean
  } = {},
): Promise<TestBlockchain> {
  const chain = await makeChainGenesis(strategy, options)

  for (let i = 1; i < 8 * 5; i++) {
    await chain.notes.add(`${i}`)

    if (i % 5 < 2) {
      await chain.nullifiers.add(makeNullifier(i))
    }

    if ((i + 1) % 5 === 0) {
      const oldNoteCount = (await chain.notes.size()) - 5
      const oldNullifierCount = (await chain.nullifiers.size()) - 2

      const nextBlock = await makeNextBlock(chain, false, oldNoteCount, oldNullifierCount)
      await chain.addBlock(nextBlock)
    }
  }

  return chain
}

/**
 * Make a block with a hash consisting of the given digit,
 * the previous hash consisting of the next digit, and the start and
 * end numbers of a height of notes in the block.
 *
 * Note: The resulting block is suitable for use on a blockchain.BlockChain,
 * but will fail if you try adding it to a blockchain without some extra
 * massaging of the values.
 *
 * Specifically, the nullifier commitment does not have a correct value against
 * the value in the tree. The note commitment should match up, though it depends
 * exactly how the tree was initially produced.
 *
 * Most notably, a block created with this function will not go onto a chain
 * created with makeChain or makeFullChain. You are probably better off using
 * makeNextBlock from the blockchain test utilities instead.
 */
export function makeFakeBlock(
  strategy: TestStrategy,
  previousHash: BlockHash,
  hash: BlockHash,
  height: number,
  start: number,
  end: number,
  timestamp?: Date,
): Block<string, string, TestTransaction, string, string, SerializedTestTransaction> {
  const transactions = []
  for (let i = start; i < end; i++) {
    transactions.push(new TestTransaction(true, [String(i)], 1))
  }

  const minersReward = strategy.miningReward(height)
  const transactionFee = -1 * (end - start + minersReward)
  const transactionFeeTransaction = new TestTransaction(true, [String(end)], transactionFee)
  transactions.push(transactionFeeTransaction)

  const graffiti = Buffer.alloc(32)
  graffiti.write('fake block')

  const header = new BlockHeader(
    strategy,
    height,
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

/**
 * Make a test chain that contains only the genesis
 * block (one note and nullifier)
 */
export async function makeInitialTestChain(
  strategy: TestStrategy,
  dbPrefix: string,
): Promise<TestBlockchain> {
  return await makeChainInitial(strategy, { dbPrefix })
}

/**
 * Make a test chain that contains several valid blocks,
 * notes, and nullifiers.
 */
export async function makeChain(
  strategy: TestStrategy,
  dbPrefix?: string,
): Promise<TestBlockchain> {
  if (!dbPrefix) {
    dbPrefix = makeDbName()
  }
  return await makeChainFull(strategy, { dbPrefix })
}

/**
 * Make a test chain that has an initial block followed by
 * a gap and then two blocks at the head. This is the kind of chain that
 * requires syncing. It is designed such that if the chain becomes fully
 * synced, it will be the same as that returned by `makeChainFull`.
 */
export async function makeChainSyncable(
  strategy: TestStrategy,
  dbPrefix?: string,
  addExtraBlocks = true,
): Promise<TestBlockchain> {
  if (!dbPrefix) {
    dbPrefix = makeDbName()
  }

  const chain = await makeChainGenesis(strategy, { dbPrefix })

  if (addExtraBlocks) {
    const chainFull = await makeChainFull(strategy, { dbPrefix: dbPrefix + '-full' })
    await chain.addBlock(await blockByHeight(chainFull, 8))
    await chain.addBlock(await blockByHeight(chainFull, 7))
    await chainFull.db.close()
  }

  return chain
}

/**
 * Extract a block from the given chain by its height.
 * Throw an error if the block is null.
 *
 * This is just for removing typescript non-null assertions.
 */
export async function blockByHeight(
  chain: TestBlockchain,
  height: number | null,
): Promise<Block<string, string, TestTransaction, string, string, SerializedTestTransaction>> {
  let hash: Buffer | null
  if (height === null) {
    const heaviestHead = chain.head
    hash = heaviestHead ? heaviestHead.hash : null
  } else {
    hash = blockHash(height)
  }

  if (!hash) {
    throw new Error(`No hash for ${height || ''}`)
  }

  const block = await chain.getBlock(hash)
  if (!block) {
    throw new Error(`Block ${height || ''} does not exist`)
  }
  return block
}
