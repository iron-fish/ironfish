/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Direction, IncomingPeerMessage, MessagePayload } from '../../../network'
import { default as Block } from '../../../blockchain/block'
import BlockHeader from '../../../blockchain/blockheader'
import { BlockSyncer } from '../../../blockSyncer'
import { BlocksResponse } from '../../../network/messages'
import { Captain } from '../../captain'
import { BlockRequest, NodeMessageType } from '../../../network/messages'

import {
  blockHash,
  makeDb,
  makeChainGenesis,
  makeChainInitial,
  makeChain,
  TestBlockchain,
} from '.'
import { SerializedTestTransaction, TestStrategy, TestTransaction } from '../strategy'
import { makeDbName } from './storage'
import { MemPool } from '../../../memPool'

export type TestCaptain = Captain<
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
 * Make a test captain with a chain that contains only the genesis
 * block (one note and nullifier)
 */
export async function makeInitialTestCaptain(
  strategy: TestStrategy,
  dbPrefix: string,
): Promise<TestCaptain> {
  const db = makeDb(dbPrefix)
  const chain = await makeChainInitial(strategy, db)
  return await Captain.new(db, strategy, chain)
}

/**
 * Make a test captain with a chain that contains several valid blocks,
 * notes, and nullifiers.
 */
export async function makeCaptain(
  strategy: TestStrategy,
  dbPrefix?: string,
): Promise<TestCaptain> {
  if (!dbPrefix) dbPrefix = makeDbName()
  const db = makeDb(dbPrefix)
  const chain = await makeChain(strategy, db)
  return await Captain.new(db, strategy, chain)
}

/**
 * Make a test captain whose chain has an initial block followed by
 * a gap and then two blocks at the head. This is the kind of chain that
 * requires syncing. It is designed such that if the chain becomes fully
 * synced, it will be the same as that returned by `makeCaptain`.
 */
export async function makeCaptainSyncable(
  strategy: TestStrategy,
  dbPrefix?: string,
  addExtraBlocks = true,
): Promise<TestCaptain> {
  if (!dbPrefix) dbPrefix = makeDbName()

  const db = makeDb(dbPrefix)
  const chain = await makeChainGenesis(strategy, db)

  const dbFull = makeDb(dbPrefix + '-full')

  if (addExtraBlocks) {
    const chainFull = await makeChain(strategy, dbFull)
    await chain.addBlock(await blockBySequence(chainFull, 8))
    await chain.addBlock(await blockBySequence(chainFull, 7))
  }
  await dbFull.close()

  return await Captain.new(db, strategy, chain)
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
