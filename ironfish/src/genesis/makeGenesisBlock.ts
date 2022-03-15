/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { Account } from '../account'
import {
  generateKey,
  Note as NativeNote,
  Transaction as NativeTransaction,
} from '@ironfish/rust-nodejs'
import { Blockchain } from '../blockchain'
import { Logger } from '../logger'
import { Block } from '../primitives'
import { Target } from '../primitives/target'
import { Transaction } from '../primitives/transaction'
import { GraffitiUtils } from '../utils/graffiti'
import { WorkerPool } from '../workerPool'

export type GenesisBlockInfo = {
  memo: string
  timestamp: number
  allocations: {
    publicAddress: string
    amount: number
  }[]
}

/**
 * Returns a special-cased block with at least one note and spend for the purpose
 * of providing an initial block for the blockchain and root hash for the note and
 * nullifier merkle trees.
 */
export async function makeGenesisBlock(
  chain: Blockchain,
  info: GenesisBlockInfo,
  account: Account,
  workerPool: WorkerPool,
  logger: Logger,
): Promise<{ block: Block }> {
  logger = logger.withTag('makeGenesisBlock')
  if (!chain.isEmpty) {
    throw new Error('Database must be empty to create a genesis block.')
  }
  // Sum the allocations to get the total number of coins
  const allocationSum = info.allocations.reduce((sum, cur) => sum + cur.amount, 0)

  // Track all of the transactions that will be added to the genesis block
  const transactionList = []

  // Create a unique key for the genesis block that's not intended for use.
  // It should end up with 0 coins.
  const genesisKey = generateKey()
  // Create a genesis note granting the genesisKey allocationSum coins.
  const genesisNote = new NativeNote(
    genesisKey.public_address,
    BigInt(allocationSum),
    info.memo,
  )

  // Create a miner's fee transaction for the block.
  // Since the block itself generates coins and we don't want the miner account to gain
  // additional coins, we'll manually create a non-standard/invalid miner's fee transaction.
  //
  // This transaction will cause block.verify to fail, but we skip block verification
  // throughout the code when the block header's previousBlockHash is GENESIS_BLOCK_PREVIOUS.
  logger.info(`Generating a miner's fee transaction for the block...`)
  const note = new NativeNote(account.publicAddress, BigInt(0), '')

  const minersFeeTransaction = new NativeTransaction()
  minersFeeTransaction.receive(account.spendingKey, note)
  const postedMinersFeeTransaction = new Transaction(
    minersFeeTransaction.post_miners_fee(),
    workerPool,
  )

  /**
   *
   * Transaction 1:
   * An initial transaction generating allocationSum coins from nothing.
   *
   */
  logger.info(`Generating an initial transaction with ${allocationSum} coins...`)
  const initialTransaction = new NativeTransaction()

  logger.info('  Generating the receipt...')
  initialTransaction.receive(genesisKey.spending_key, genesisNote)

  logger.info('  Posting the initial transaction...')
  const postedInitialTransaction = new Transaction(
    initialTransaction.post_miners_fee(),
    workerPool,
  )
  transactionList.push(postedInitialTransaction)

  // Temporarily add the miner's fee note and the note from the transaction to our merkle tree
  // so we can construct a witness. They will be re-added later when the block is constructed.
  logger.info('  Adding the note to the tree...')
  if (postedInitialTransaction.notesLength() !== 1) {
    throw new Error('Expected postedInitialTransaction to have 1 note')
  }
  await chain.notes.add(postedMinersFeeTransaction.getNote(0))
  await chain.notes.add(postedInitialTransaction.getNote(0))

  // Construct a witness of the Transaction 1 note
  logger.info('  Constructing a witness of the note...')
  const witness = await chain.notes.witness(1)
  if (witness === null) {
    throw new Error('We must be able to construct a witness in order to generate a spend.')
  }

  // Now that we have the witness, remove the note from the tree
  logger.info('  Removing the note from the tree...')
  await chain.notes.truncate(0)

  /**
   *
   * Transaction 2:
   * Moves coins from the note in Transaction 1 to each of the allocation addresses.
   *
   */
  logger.info('Generating a transaction for distributing allocations...')
  const transaction = new NativeTransaction()
  logger.info(`  Generating a spend for ${allocationSum} coins...`)
  transaction.spend(genesisKey.spending_key, genesisNote, witness)

  for (const alloc of info.allocations) {
    logger.info(
      `  Generating a receipt for ${alloc.amount} coins for ${alloc.publicAddress}...`,
    )
    const note = new NativeNote(alloc.publicAddress, BigInt(alloc.amount), info.memo)
    transaction.receive(genesisKey.spending_key, note)
  }

  logger.info('  Posting the transaction...')
  const postedTransaction = new Transaction(
    transaction.post(genesisKey.spending_key, undefined, BigInt(0)),
    workerPool,
  )
  transactionList.push(postedTransaction)

  /**
   *
   * Now we have all the transactions we need, so we can put together the block.
   *
   */
  logger.info('Generating a block...')

  // Create the block. We expect this to add notes and nullifiers on the block
  // into the database for the purpose of generating note and nullifier commitments
  // on the block header.
  const block = await chain.newBlock(
    transactionList,
    postedMinersFeeTransaction,
    GraffitiUtils.fromString('genesis'),
  )

  // Modify the block with any custom properties.
  block.header.target = Target.initialTarget()
  block.header.timestamp = new Date(info.timestamp)

  logger.info('Block complete.')
  return { block }
}
