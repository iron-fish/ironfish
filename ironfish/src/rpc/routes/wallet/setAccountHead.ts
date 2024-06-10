/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { FullNode } from '../../../node'
import { Block, BlockHeader, Transaction } from '../../../primitives'
import { DecryptedNote } from '../../../workerPool/tasks/decryptNotes'
import { RPC_ERROR_CODES, RpcResponseError, RpcValidationError } from '../../adapters'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { getAccount } from './utils'

export type SetAccountHeadRequest = {
  /**
   * Name of the account to update.
   */
  account: string
  /**
   * Starting block hash (inclusive). Used to verify that you haven't accidentally skipped
   * decrypting transactions in blocks between the account head and this block hash.
   * This block must connect to the account head with no gaps.
   */
  start: string
  /**
   * Last block hash (inclusive). Account head will be set to this
   * when the request finishes successfully.
   */
  end: string
  /**
   * Blocks between start and end (inclusive) that contain transactions in which the
   * account is either a sender or a recipient.
   */
  blocks: { hash: string; transactions: { hash: string }[] }[]
}

export type SetAccountHeadResponse = undefined

export const SetAccountHeadRequestSchema: yup.ObjectSchema<SetAccountHeadRequest> = yup
  .object({
    account: yup.string().defined(),
    start: yup.string().defined(),
    end: yup.string().defined(),
    blocks: yup
      .array(
        yup
          .object({
            hash: yup.string().defined(),
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
          .defined(),
      )
      .defined(),
  })
  .defined()

export const SetAccountHeadResponseSchema: yup.MixedSchema<SetAccountHeadResponse> = yup
  .mixed()
  .oneOf([undefined] as const)

routes.register<typeof SetAccountHeadRequestSchema, SetAccountHeadResponse>(
  `${ApiNamespace.wallet}/setAccountHead`,
  SetAccountHeadRequestSchema,
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
        `Cannot set account head while account scanning is enabled. Try calling wallet/setScanning first.`,
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

      // If fork is startHeader:
      //  - This means startHeader is linearly older than accountHead.
      //  - We will rewind accountHead to the block before startHeader.
      //  - You could also ignore all blocks before and including accountHead. (Note that this also
      //    applies if startHeader == accountHead). We choose not to because it keeps the code simpler
      //    for now.
      // If fork is accountHead or neither:
      //  - This means accountHead is earlier than startHeader.
      //  - we want to abort if there's a gap between accountHead and startHeader, since there may be
      //    transactions in the gap relevant to the account. (alternatively, we could consider scanning
      //    all blocks in the gap, as in a typical wallet scanß)
      //  - If fork is startHeader.previousBlockHash, the fork directly connects to startHeader, so
      //    rewind accountHead to startHeader.previousBlockHash. Note that we must rewind, we cannot
      //    ignore blocks in this case because the accountHead is on a different chain.
      //  - Otherwise there's a gap between accountHead and startHeader, so abort
      if (!fork.equals(startHeader) && !fork.hash.equals(startHeader.previousBlockHash)) {
        const nextHash = (await context.chain.getNextHash(fork.hash)) ?? fork.hash
        throw new RpcValidationError(`Start must be ${nextHash?.toString('hex')} or earlier.`)
      }

      while (accountHead !== null && !accountHead.hash.equals(startHeader.previousBlockHash)) {
        if (request.closed) {
          request.end()
          return
        }

        const block: Block | null = await context.chain.getBlock(accountHead.hash)
        Assert.isNotNull(block, 'Account head must be in chain')
        await context.wallet.disconnectBlockForAccount(
          account,
          block.header,
          block.transactions,
        )
        accountHead = await account.getHead()
      }
    }

    // When accountHead is null, startHeader should be the genesis block, else we have gaps
    if (accountHead === null && !startHeader.equals(context.chain.genesis)) {
      throw new RpcValidationError(
        `Start must be ${context.chain.genesis.hash.toString('hex')} if account head is null.`,
      )
    }

    // Fetch block headers and transactions for hashes
    const transactionList: {
      header: BlockHeader
      transactions: { transaction: Transaction; initialNoteIndex: number }[]
    }[] = []

    for (const b of request.data.blocks) {
      if (b.transactions.length === 0) {
        throw new RpcValidationError(`Block ${b.hash} must have at least one transaction.`)
      }

      const header = await context.chain.getHeader(Buffer.from(b.hash, 'hex'))
      if (header === null) {
        throw new RpcResponseError(`Block ${b.hash} doesn't exist in the chain.`)
      } else if (header.sequence < startHeader.sequence) {
        throw new RpcResponseError(`Block ${b.hash} is before start.`)
      } else if (header.sequence > endHeader.sequence) {
        throw new RpcResponseError(`Block ${b.hash} is after end.`)
      }

      const blockTransactions = await context.chain.getBlockTransactions(header)
      const transactionHashes = new Set(b.transactions.map((t) => t.hash))
      const transactions: { transaction: Transaction; initialNoteIndex: number }[] = []

      for (const transaction of blockTransactions) {
        const hash = transaction.transaction.hash().toString('hex')
        if (transactionHashes.has(hash)) {
          transactions.push({
            transaction: transaction.transaction,
            initialNoteIndex: transaction.initialNoteIndex,
          })

          transactionHashes.delete(hash)
          if (transactionHashes.size === 0) {
            break
          }
        }
      }

      if (transactionHashes.size > 0) {
        const missingTransactions = [...transactionHashes]
        throw new RpcValidationError(
          `Block ${b.hash} does not include transactions: ${missingTransactions.join(', ')}`,
        )
      }

      transactionList.push({
        header: header,
        transactions: transactions,
      })
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
      if (request.closed) {
        request.end()
        return
      }

      await context.wallet.connectBlockForAccount(
        account,
        blockTransactions.header,
        blockTransactions.transactions,
        true,
      )
    }

    // If last block isn't end, connect end
    const last = transactionWithNotesList.at(-1)
    if (!last || !last.header.equals(endHeader)) {
      await context.wallet.connectBlockForAccount(account, endHeader, [], false)
    }

    request.end()
  },
)
