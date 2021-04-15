/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Account } from '../../../account'
import { Assert } from '../../../assert'
import { BlockSyncer } from '../../../blockSyncer'
import { createRootLogger } from '../../../logger'
import { GENESIS_BLOCK_PREVIOUS } from '../../../consensus'
import { IDatabase } from '../../../storage'
import { IronfishBlock, IronfishBlockchain, IronfishBlockHeader } from '../../../strategy'
import { IronfishNode } from '../../../node'
import { makeDb, makeDbName } from './storage'
import { RangeHasher } from '../../../merkletree'
import { SerializedTestTransaction, TestStrategy, TestTransaction } from '../strategy'
import { Spend } from '../../../strategy/transaction'
import { Target } from '../../../blockchain/target'
import { useBlockFixture, useMinerBlockFixture } from '../../fixtures'
import Block from '../../../blockchain/block'
import Blockchain from '../../../blockchain'
import BlockHeader, { BlockHash } from '../../../blockchain/blockheader'
import Strategy from '../../../strategy/strategy'
import { MemPool } from '../../../memPool'
import {
  BlockRequest,
  BlocksResponse,
  IncomingPeerMessage,
  MessagePayload,
  NodeMessageType,
} from '../../../network/messages'
import { Direction } from '../../../network/messageRouters/rpc'

/**
 * Type of a test anchorchain, encompassing the various generic parameters.
 */
export type TestBlockchain = Blockchain<
  string,
  string,
  TestTransaction,
  string,
  string,
  SerializedTestTransaction
>

export type TestMemPool = MemPool<
  string,
  string,
  TestTransaction,
  string,
  string,
  SerializedTestTransaction
>

export type TestBlockSyncer = BlockSyncer<
  string,
  string,
  TestTransaction,
  string,
  string,
  SerializedTestTransaction
>

export type TestBlockHeader = BlockHeader<
  string,
  string,
  TestTransaction,
  string,
  string,
  SerializedTestTransaction
>

export type TestBlock = Block<
  string,
  string,
  TestTransaction,
  string,
  string,
  SerializedTestTransaction
>

/**
 * Add the notes directly to the anchorchain's notes merkle tree
 * without doing any of the checking or syncing that would happen in
 * `anchor.addNote`
 */
export async function addNotes(
  anchor: Blockchain<
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
    await anchor.notes.add(`${note}`)
  }
}

/**
 * Set the note and nullifier commitments of the given block to the size and root
 * hash of the notes and nullifiers trees on the given chain.
 *
 * There is a chance this functionality could be useful for more than testing.
 * It could be moved to a method on anchorChain.
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
  anchor: Blockchain<
    string,
    string,
    TestTransaction,
    string,
    string,
    SerializedTestTransaction
  >,
): Promise<void> {
  header.noteCommitment.size = await anchor.notes.size()
  header.noteCommitment.commitment = await anchor.notes.rootHash()
  header.nullifierCommitment.size = await anchor.nullifiers.size()
  header.nullifierCommitment.commitment = await anchor.nullifiers.rootHash()
}

/**
 * Make a block that suits the two trees currently on the chain. All notes/nullifiers
 * that were added to the anchorchain (using chain.notes.add, not chain.AddNote)
 * since the head of the chain are entered as transactions
 * into the fake block. The last note in the tree becomes the miner's fee.
 * The hash and previous hash are all derived from the sequence.
 *
 * Warning: This will not work if you don't add at least one note to the anchorchain
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
  const head = await chain.getHeaviestHead()
  const noteCount = await chain.notes.size()
  const noteHash = await chain.notes.rootHash()
  const nullifierCount = await chain.nullifiers.size()
  const nullifierHash = await chain.nullifiers.rootHash()

  let newSequence = 1
  let previousBlockHash

  if (isGenesis) {
    newSequence = 1
    oldNoteCount = 0
    oldNullifierCount = 0
    previousBlockHash = GENESIS_BLOCK_PREVIOUS
  } else {
    if (!head) {
      throw new Error('Heaviest head must always exist after adding genesis')
    }
    newSequence = Number(head.sequence) + 1
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
    BigInt(newSequence),
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
    new Date(1598970000000 + Number(newSequence)),
    minersFee,
    graffiti,
  )

  return new Block(newHeader, [minerTransaction])
}

/**
 * Make an anchorchain with no blocks.
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
  dbPrefix?: string | IDatabase,
): Promise<TestBlockchain> {
  const db =
    typeof dbPrefix === 'string' || dbPrefix === undefined ? makeDb(dbPrefix) : dbPrefix
  const chain = Blockchain.new(
    db,
    strategy || new TestStrategy(new RangeHasher()),
    createRootLogger(),
  )

  await db.open()
  return chain
}

/**
 * Make an anchorchain with a genesis block that has one note and one nullifier.
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
  dbPrefix?: string | IDatabase,
): Promise<TestBlockchain> {
  const chain = await makeChainInitial(strategy, dbPrefix)
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
  dbPrefix?: string | IDatabase,
): Promise<TestBlockchain> {
  const chain = await makeChainGenesis(strategy, dbPrefix)

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
 * Create a test block with no transactions, that can be after any block either on the chain or not.
 * It works by not affecting the merkle trees at all, and requires this block to have no transactions,
 * therefore no notes.
 *
 * @param chain the chain is not used, only the verifier and strategy from the chain
 * @param after the block the created block should be after
 */
export async function makeBlockAfter(
  chain: IronfishBlockchain,
  after: IronfishBlockHeader | IronfishBlock,
): Promise<IronfishBlock> {
  if (after instanceof Block) {
    after = after.header
  }

  const sequence = after.sequence + BigInt(1)
  const miningReward = BigInt(chain.strategy.miningReward(sequence))

  if (miningReward !== BigInt(0)) {
    throw new Error(`Must have mining reward disabled but was ${miningReward}`)
  }

  const timestamp = new Date()
  const target = Target.calculateTarget(timestamp, after.timestamp, after.target)
  const randomness = Math.random()
  const graffiti = Buffer.alloc(32)
  graffiti.write('fake block')

  const header = new BlockHeader(
    chain.strategy,
    sequence,
    after.hash,
    after.noteCommitment,
    after.nullifierCommitment,
    target,
    randomness,
    timestamp,
    miningReward,
    graffiti,
    true,
    BigInt(1),
  )

  const block = new Block(header, [])

  Assert.isTrue((await chain.verifier.verifyBlock(block)).valid === 1)
  return block
}

/**
 * Adds a block to the chain that gives {@link from} a
 * miners fee, then a transaction on a new block that
 * gives that miners fee to {@link to}, as well as another
 * miners fee for {@link from}.
 *
 * Returned block has 1 spend, 3 notes
 */
export async function makeBlockWithTransaction(
  node: IronfishNode,
  from: Account,
  to: Account,
): Promise<IronfishBlock> {
  const head = await node.chain.getHeaviestHead()
  Assert.isNotNull(head, 'No genesis block. Call node.seed() first')
  const sequence = head.sequence

  const block1 = await useMinerBlockFixture(
    node.chain,
    sequence + BigInt(1),
    from,
    node.accounts,
  )

  await node.chain.addBlock(block1)
  await node.accounts.updateHead()

  const block2 = await useBlockFixture(node.chain, async () => {
    const transaction = await node.accounts.createTransaction(
      from,
      BigInt(1),
      BigInt(0),
      '',
      to.publicAddress,
    )

    return node.chain.newBlock(
      [transaction],
      await node.chain.strategy.createMinersFee(
        await transaction.transactionFee(),
        sequence + BigInt(2),
        from.spendingKey,
      ),
    )
  })

  return block2
}

/**
 * This adds blocks to a chain in random order. It's useful to help root out bugs where insertion order
 * can create bugs because someone accidently wrote code that is graph structure dependent. If any block
 * fails to be added, the operation will stop and return false
 *
 * @param chain the chain to insert blocks into
 * @param blocks the blocks to insert in random order
 * @param randomDrop should it randomly decide drop blocks with a 10% chance
 */
export async function addBlocksShuffle(
  chain: IronfishBlockchain,
  blocks: IronfishBlock[],
  randomDrop = false,
): Promise<boolean> {
  blocks = [...blocks]

  while (blocks.length > 0) {
    const index = Math.floor(Math.random() * blocks.length)
    const block = blocks.splice(index, 1)[0]

    const shouldDrop = randomDrop && Math.random() > 0.9
    if (shouldDrop) continue

    const { isAdded } = await chain.addBlock(block)
    if (!isAdded) return false
  }

  return true
}

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
 * created with makeChain or makeFullChain. You are probably better off using
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

/**
 * Make a test chain that contains only the genesis
 * block (one note and nullifier)
 */
export async function makeInitialTestChain(
  strategy: TestStrategy,
  dbPrefix: string,
): Promise<TestBlockchain> {
  const db = makeDb(dbPrefix)
  return await makeChainInitial(strategy, db)
}

/**
 * Make a test chain that contains several valid blocks,
 * notes, and nullifiers.
 */
export async function makeChain(
  strategy: TestStrategy,
  dbPrefix?: string,
): Promise<TestBlockchain> {
  if (!dbPrefix) dbPrefix = makeDbName()
  const db = makeDb(dbPrefix)
  return await makeChainFull(strategy, db)
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
  if (!dbPrefix) dbPrefix = makeDbName()

  const db = makeDb(dbPrefix)
  const chain = await makeChainGenesis(strategy, db)

  const dbFull = makeDb(dbPrefix + '-full')

  if (addExtraBlocks) {
    const chainFull = await makeChainFull(strategy, dbFull)
    await chain.addBlock(await blockBySequence(chainFull, 8))
    await chain.addBlock(await blockBySequence(chainFull, 7))
  }
  await dbFull.close()

  return chain
}

/**
 * Extract a block from the given chain by its sequence.
 * Throw an error if the block is null.
 *
 * This is just for removing typescript non-null assertions.
 */
export async function blockBySequence(
  chain: TestBlockchain,
  sequence: number | null,
): Promise<Block<string, string, TestTransaction, string, string, SerializedTestTransaction>> {
  let hash: Buffer | null
  if (sequence === null) {
    const heaviestHead = await chain.getHeaviestHead()
    hash = heaviestHead ? heaviestHead.hash : null
  } else {
    hash = blockHash(sequence)
  }

  if (!hash) throw new Error(`No hash for ${sequence || ''}`)

  const block = await chain.getBlock(hash)
  if (!block) {
    throw new Error(`Block ${sequence || ''} does not exist`)
  }
  return block
}

/**
 * Format a proper response given a payload for Block Syncer
 */
export function response(
  payload: MessagePayload<BlocksResponse<string, SerializedTestTransaction<string>>>,
): IncomingPeerMessage<BlocksResponse<string, SerializedTestTransaction<string>>> {
  return {
    peerIdentity: 'somebody',
    message: {
      rpcId: 1,
      type: NodeMessageType.Blocks,
      direction: Direction.response,
      payload: payload,
    },
  }
}

/**
 * Format a proper request given a payload for Block Syncer
 */
export function request(
  payload: MessagePayload<BlockRequest>,
): IncomingPeerMessage<BlockRequest> {
  return {
    peerIdentity: 'somebody',
    message: {
      type: NodeMessageType.Blocks,
      payload: payload,
    },
  }
}
