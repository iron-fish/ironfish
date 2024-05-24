/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { FullNode } from '../../../node'
import { BlockHeader, Transaction } from '../../../primitives'
import { DecryptedNote } from '../../../workerPool/tasks/decryptNotes'
import { RPC_ERROR_CODES, RpcResponseError, RpcValidationError } from '../../adapters'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { getAccount } from './utils'

export type AddKnownTransactionsRequest = {
  /**
   * Name of the account to update.
   */
  account: string
  start: string
  /**
   * Last block (inclusive). Account head will be set to this
   * when the request finishes successfully.
   */
  end: string
  transactions: { hash: string }[]
}

export type AddKnownTransactionsResponse = undefined

export const AddKnownTransactionsRequestSchema: yup.ObjectSchema<AddKnownTransactionsRequest> =
  yup
    .object({
      account: yup.string().defined(),
      start: yup.string().defined(),
      end: yup.string().defined(),
      transactions: yup
        .array(
          yup
            .object({
              hash: yup.string().defined(),
            })
            .defined(),
        )
        .defined(),
    })
    .defined()

export const AddKnownTransactionsResponseSchema: yup.MixedSchema<AddKnownTransactionsResponse> =
  yup.mixed().oneOf([undefined] as const)

routes.register<typeof AddKnownTransactionsRequestSchema, AddKnownTransactionsResponse>(
  `${ApiNamespace.wallet}/addKnownTransactions`,
  AddKnownTransactionsRequestSchema,
  async (request, context): Promise<void> => {
    Assert.isInstanceOf(context, FullNode)

    // Validate start and end header hashes
    const startHeader = await context.chain.getHeader(Buffer.from(request.data.start, 'hex'))
    const endHeader = await context.chain.getHeader(Buffer.from(request.data.end, 'hex'))

    if (!startHeader || !(await context.chain.isHeadChain(startHeader))) {
      throw new RpcValidationError('Start block is not on the head chain.')
    }

    if (!endHeader || !(await context.chain.isHeadChain(endHeader))) {
      throw new RpcValidationError('End block is not on the head chain.')
    }

    if (startHeader.sequence > endHeader.sequence) {
      throw new RpcValidationError('End block must be greater than or equal to start block.')
    }

    // Validate account state
    const account = getAccount(context.wallet, request.data.account)

    if (account.scanningEnabled) {
      throw new RpcResponseError(
        `Cannot add known transactions while account syncing is enabled. Try calling wallet/stopScanning first.`,
        RPC_ERROR_CODES.ERROR,
        409,
      )
    }

    // Validate account head is compatible with start and end blocks
    let accountHead = await account.getHead()

    if (accountHead !== null) {
      const accountHeader = await context.chain.getHeader(accountHead.hash)
      if (!accountHeader) {
        throw new Error(`accountHead ${accountHead.hash.toString('hex')} not found in chain`)
      }

      const fork = await context.chain.findFork(startHeader, accountHeader)

      // if fork is startHeader
      //  - rewind accountHead to the block before startHeader
      //  - You could also ignore all blocks before and including accountHead. (Note that this also
      //    applies if startHeader == accountHead). You'd need to check startHeader and accountHead
      //    are on the head chain, else you'd still need to rewind accountHead.
      // if fork is accountHead or neither:
      //  - if startHeader.previousBlockHash is fork, we're okay. if needed, rewind accountHead
      //    to the block before startHeader
      //  - otherwise there's a gap between accountHead and startHeader, so reject
      if (!fork.equals(startHeader) && !startHeader.previousBlockHash.equals(fork.hash)) {
        const nextHash = (await context.chain.getNextHash(fork.hash)) ?? fork.hash
        throw new RpcValidationError(`Start must be ${nextHash?.toString('hex')} or earlier.`)
      }

      // TODO: test startheader as genesis
      while (accountHead && !accountHead.hash.equals(startHeader.previousBlockHash)) {
        const header: BlockHeader | null = await context.chain.getHeader(accountHead.hash)
        Assert.isNotNull(header, 'Account head must be in chain')
        const transactions = await context.chain.getBlockTransactions(header)
        await context.wallet.disconnectBlockForAccount(account, header, transactions)
        accountHead = await account.getHead()
      }
    }

    // When accountHead is null, startHeader should be the genesis block, else we have gaps
    if (accountHead === null && !startHeader.equals(context.chain.genesis)) {
      throw new RpcValidationError(
        `Start must be ${context.chain.genesis.hash.toString('hex')} if account head is null.`,
      )
    }

    // Push hashes into a set, then drain the set into a map of block header -> full transactions
    const transactionSet = new Set(
      request.data.transactions.map((t) => t.hash.toLowerCase().trim()),
    )

    const transactionList: {
      header: BlockHeader
      transactions: { transaction: Transaction; initialNoteIndex: number }[]
    }[] = []

    while (transactionSet.size > 0) {
      const [hash] = transactionSet
      const blockHash = await context.chain.getBlockHashByTransactionHash(
        Buffer.from(hash, 'hex'),
      )
      if (blockHash === null) {
        throw new RpcResponseError(`Transaction ${hash} doesn't exist in the chain.`)
      }
      const blockHeader = await context.chain.getHeader(blockHash)
      if (blockHeader === null) {
        throw new RpcResponseError(
          `Block ${blockHash.toString(
            'hex',
          )} for transaction ${hash} doesn't exist in the chain.`,
        )
      } else if (blockHeader.sequence < startHeader.sequence) {
        throw new RpcResponseError(`Transaction ${hash} is before the start.`)
      } else if (blockHeader.sequence > endHeader.sequence) {
        throw new RpcResponseError(`Transaction ${hash} is after the end.`)
      }

      const transactions = await context.chain.getBlockTransactions(blockHeader)
      const result: {
        header: BlockHeader
        transactions: { transaction: Transaction; initialNoteIndex: number }[]
      } = {
        header: blockHeader,
        transactions: [],
      }
      for (const txn of transactions) {
        const txnHash = txn.transaction.hash().toString('hex')
        if (transactionSet.has(txnHash)) {
          result.transactions.push({
            transaction: txn.transaction,
            initialNoteIndex: txn.initialNoteIndex,
          })
          transactionSet.delete(txnHash)
        }
      }

      transactionList.push(result)
    }

    // Decrypt all of the known transactions
    const decryptedTransactions: {
      transaction: Transaction
      notes: DecryptedNote[]
    }[] = await Promise.all(
      transactionList
        .flatMap((t) => t.transactions)
        .map(async (txn) =>
          context.wallet
            .decryptNotes(txn.transaction, txn.initialNoteIndex, false, [account])
            .then((r) => {
              if (r.size === 0) {
                return { transaction: txn.transaction, notes: [] }
              }
              Assert.isEqual(r.size, 1, 'Decrypted notes for multiple accounts')

              const notes = r.get(account.id)
              Assert.isNotUndefined(notes, 'Decrypted for wrong account')
              return { transaction: txn.transaction, notes }
            }),
        ),
    )
    const decryptedNotes: Map<string, DecryptedNote[]> = new Map(
      decryptedTransactions.map((t) => [t.transaction.hash().toString('hex'), t.notes]),
    )

    // Map the decrypted transactions back into blockHeader, transaction, and decryptedNotes
    const transactionWithNotesList = transactionList.map((txn) => {
      return {
        header: txn.header,
        transactions: txn.transactions.map((t) => {
          const notes = decryptedNotes.get(t.transaction.hash().toString('hex'))
          Assert.isNotUndefined(
            notes,
            `Expected a notes array for every transaction, even if empty`,
          )
          return {
            transaction: t.transaction,
            decryptedNotes: notes,
          }
        }),
      }
    })

    // Sort the list by block sequence, ascending
    transactionWithNotesList.sort((a, b) => a.header.sequence - b.header.sequence)

    // Connect each block
    for (const blockTransactions of transactionWithNotesList) {
      await context.wallet.connectBlockForAccount(
        account,
        blockTransactions.header,
        blockTransactions.transactions,
        true,
      )
    }

    // If last block isn't end - 1, connect end-1
    const last = transactionWithNotesList.at(-1)
    if (!last || !last.header.equals(endHeader)) {
      await context.wallet.connectBlockForAccount(account, endHeader, [], false)
    }

    request.end()
  },
)
