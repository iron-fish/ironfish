/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  Asset,
  Note as NativeNote,
  Transaction as NativeTransaction,
} from '@ironfish/rust-nodejs'
import { Logger } from '../logger'
import { FullNode } from '../node'
import { Block } from '../primitives'
import { transactionCommitment } from '../primitives/blockheader'
import { Transaction, TransactionVersion } from '../primitives/transaction'
import { CurrencyUtils } from '../utils'
import { Account } from '../wallet'
import { GenesisBlockAllocation } from './makeGenesisBlock'

export async function addGenesisTransaction(
  node: FullNode,
  account: Account,
  allocations: GenesisBlockAllocation[],
  logger: Logger,
): Promise<{ block: Block }> {
  logger = logger.withTag('addGenesisTransaction')

  if (!account.spendingKey) {
    throw new Error('Must be a full account, not a view account')
  }

  // Sum the allocations to get the total number of coins
  const allocationSum = allocations.reduce((sum, cur) => sum + cur.amountInOre, 0n)
  const allocationSumInIron = CurrencyUtils.encodeIron(allocationSum)

  logger.info('Generating a transaction for distributing allocations...')

  // Get a previous note owned by the given account from the existing genesis block
  let note: NativeNote | null = null
  let witness = null
  const genesisTransactions = await node.chain.getBlockTransactions(node.chain.genesis)
  for (const { transaction, initialNoteIndex } of genesisTransactions) {
    let noteIndex = -1
    for (const encryptedNote of transaction.notes) {
      noteIndex += 1
      // If this account can't decrypt this note, we can't use it
      const decryptedNote = encryptedNote.decryptNoteForOwner(account.incomingViewKey)
      if (decryptedNote == null) {
        continue
      }

      // If the nullifier has already been revealed, we can't use it
      const nullifier = decryptedNote.nullifier(
        account.viewKey,
        BigInt(initialNoteIndex + noteIndex),
      )
      if (await node.chain.nullifiers.get(nullifier)) {
        continue
      }

      // We want the note with the exact value
      if (decryptedNote.value() !== allocationSum) {
        continue
      }

      witness = await node.chain.notes.witness(initialNoteIndex + noteIndex)
      note = decryptedNote.takeReference()
      decryptedNote.returnReference()
      break
    }

    if (note != null) {
      break
    }
  }

  if (note == null) {
    throw new Error(
      'The given account does not have a suitable note to spend for the new allocations',
    )
  }

  if (witness == null) {
    throw new Error('The witness is missing, this should not happen')
  }

  if (note.value() !== allocationSum) {
    throw new Error('The value of the note to spend does not match the sum of the allocations')
  }

  // Create the new transaction to be appended to the new genesis block
  const transaction = new NativeTransaction(TransactionVersion.V2)
  logger.info(`  Generating a spend for ${allocationSumInIron} coins...`)
  transaction.spend(note, witness)

  for (const alloc of allocations) {
    logger.info(
      `  Generating an output for ${CurrencyUtils.encodeIron(alloc.amountInOre)} coins for ${
        alloc.publicAddress
      }...`,
    )
    const note = new NativeNote(
      alloc.publicAddress,
      BigInt(alloc.amountInOre),
      Buffer.from(alloc.memo, 'hex'),
      Asset.nativeId(),
      account.publicAddress,
    )
    transaction.output(note)
  }

  logger.info('  Posting the transaction...')
  const postedTransaction = new Transaction(
    transaction.post(account.spendingKey, undefined, BigInt(0)),
  )

  logger.info('Creating the modified genesis block...')
  // Get the existing genesis block
  const genesisBlock = await node.chain.getBlock(node.chain.genesis)
  if (genesisBlock == null) {
    throw new Error('An existing genesis block was not found')
  }

  // Append the new transaction
  genesisBlock.transactions.push(postedTransaction)

  // Add the new notes to the merkle tree
  await node.chain.notes.addBatch(postedTransaction.notes)

  // Generate a new block header for the new genesis block
  const noteCommitment = await node.chain.notes.rootHash()
  const noteSize = await node.chain.notes.size()

  const rawHeader = {
    sequence: 1,
    previousBlockHash: genesisBlock.header.previousBlockHash,
    noteCommitment,
    transactionCommitment: transactionCommitment(genesisBlock.transactions),
    target: genesisBlock.header.target,
    randomness: genesisBlock.header.randomness,
    timestamp: genesisBlock.header.timestamp,
    graffiti: genesisBlock.header.graffiti,
  }

  const newGenesisHeader = node.chain.newBlockHeaderFromRaw(rawHeader, noteSize)

  genesisBlock.header = newGenesisHeader

  logger.info('Block complete.')
  return { block: genesisBlock }
}
