/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { FullNode } from '../../../node'
import { BlockHeader, GENESIS_BLOCK_SEQUENCE, Transaction } from '../../../primitives'
import { DecryptedNote } from '../../../workerPool/tasks/decryptNotes'
import { RPC_ERROR_CODES, RpcResponseError, RpcValidationError } from '../../adapters'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { getAccount } from './utils'

export type AddKnownTransactionsRequest = {
  account: string
  start: number
  /**
   * Last block (exclusive). Account head should be end - 1 when this finishes.
   */
  end: number
  transactions: { hash: string }[]
}

export type AddKnownTransactionsResponse = undefined

export const AddKnownTransactionsRequestSchema: yup.ObjectSchema<AddKnownTransactionsRequest> =
  yup
    .object({
      account: yup.string().defined(),
      start: yup.number().min(0).defined(),
      end: yup.number().min(0).defined(),
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
  `${ApiNamespace.wallet}/addTransaction`,
  AddKnownTransactionsRequestSchema,
  async (request, context): Promise<void> => {
    Assert.isInstanceOf(context, FullNode)

    if (request.data.start >= request.data.end) {
      throw new RpcValidationError('End block must be greater than start block.')
    }

    const account = getAccount(context.wallet, request.data.account)

    if (account.syncingEnabled) {
      throw new RpcResponseError(
        `Cannot add known transactions while account syncing is enabled. Try calling wallet/stopSyncing first.`,
        RPC_ERROR_CODES.ERROR,
        409,
      )
    }

    // Validate the start/end parameters
    const head = await account.getHead()
    const lastBlockSequence = head?.sequence ?? GENESIS_BLOCK_SEQUENCE - 1
    // Reject request if it doesn't connect to the account head
    if (
      request.data.start > lastBlockSequence + 1 ||
      request.data.end < lastBlockSequence + 2
    ) {
      throw new RpcResponseError(
        `Account head is ${lastBlockSequence}, so start must be at most ${
          lastBlockSequence + 1
        } and end must be at least ${lastBlockSequence + 2}.`,
        RPC_ERROR_CODES.ERROR,
        409,
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
      } else if (blockHeader.sequence < request.data.start) {
        throw new RpcResponseError(`Transaction ${hash} is before the start.`)
      } else if (blockHeader.sequence >= request.data.end) {
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
    transactionList.sort((a, b) => a.header.sequence - b.header.sequence)

    // Connect each block
    for (const blockTransactions of transactionWithNotesList) {
      await context.wallet.connectBlockForAccount(
        account,
        blockTransactions.header,
        blockTransactions.transactions,
        true,
      )
    }

    // const processor = new ChainProcessor({
    //   logger: context.logger,
    //   chain: context.chain,
    //   head: hash,
    // })

    // processor.onAdd.on(async (bh) => {
    //   const txns = await context.chain.getBlockTransactions(bh)
    //   const knownTxns = txns.filter((t) => transactionSet.has(t.transaction.hash()))

    //   const decryptedTransactions = await Promise.all(
    //     knownTxns.map(({ transaction, initialNoteIndex }) =>
    //       context.wallet
    //         .decryptNotes(transaction, initialNoteIndex, false, [account])
    //         .then((r) => ({
    //           result: r,
    //           transaction,
    //         })),
    //     ),
    //   )

    //   // transaction hash -> Array<DecryptedNote>
    //   const decryptedNotesMap: BufferMap<Array<DecryptedNote>> = new BufferMap()
    //   for (const { transaction, result } of decryptedTransactions) {
    //     for (const [_, decryptedNotes] of result) {
    //       decryptedNotesMap.set(transaction.hash(), decryptedNotes)
    //     }
    //   }

    //   await context.wallet.connectBlockForAccount(account, bh, knownTxns)
    // })

    // processor.onRemove.on(async (bh) => {
    //   const txns = await context.chain.getBlockTransactions(bh)
    //   await context.wallet.disconnectBlock(bh, txns)
    // })

    // await processor.update()
    request.end()
  },
)
