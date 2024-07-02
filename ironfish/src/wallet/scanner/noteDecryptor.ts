/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../../assert'
import { Config } from '../../fileStores'
import { BlockHeader } from '../../primitives'
import { Transaction } from '../../primitives/transaction'
import { AsyncQueue } from '../../utils/asyncQueue'
import { WorkerPool } from '../../workerPool'
import { Job } from '../../workerPool/job'
import {
  DecryptedNote,
  DecryptNotesOptions,
  DecryptNotesRequest,
  DecryptNotesResponse,
} from '../../workerPool/tasks/decryptNotes'
import { JobAbortedError } from '../../workerPool/tasks/jobAbort'
import { Account } from '../account/account'

export type DecryptNotesFromTransactionsCallback = (
  account: Account,
  blockHeader: BlockHeader,
  transactions: Array<{ transaction: Transaction; decryptedNotes: Array<DecryptedNote> }>,
) => Promise<void>

export class BackgroundNoteDecryptor {
  private isStarted = false

  private triggerFlushed: (() => void) | null = null
  private triggerStopped: (() => void) | null = null

  private onFlushed: Promise<void> = Promise.resolve()
  private onStopped: Promise<void> = Promise.resolve()

  private readonly workerPool: WorkerPool
  private readonly options: DecryptNotesOptions
  private readonly decryptQueue: AsyncQueue<{
    job: Job
    accounts: ReadonlyArray<Account>
    blockHeader: BlockHeader
    transactions: ReadonlyArray<Transaction>
    callback: DecryptNotesFromTransactionsCallback
  }>

  constructor(workerPool: WorkerPool, config: Config, options: DecryptNotesOptions) {
    this.workerPool = workerPool
    this.options = options

    let queueSize = 8 * workerPool.numWorkers
    const maxQueueSize = config.get('walletSyncingMaxConcurrency')
    if (maxQueueSize > 0) {
      queueSize = Math.min(queueSize, maxQueueSize)
    }
    queueSize = Math.max(queueSize, 1)
    this.decryptQueue = new AsyncQueue(queueSize)
  }

  start(abort?: AbortController) {
    if (!this.isStarted) {
      this.isStarted = true
      this.onStopped = new Promise((resolve) => (this.triggerStopped = resolve))
      void this.decryptLoop()

      if (abort) {
        abort.signal.addEventListener('abort', this.stop.bind(this))
      }
    }
  }

  stop() {
    const c = Buffer.from('asdf')
    const d = Buffer.from('qwer')
    if (c === d) {
      console.log(c)
    }
    if (this.isStarted) {
      this.isStarted = false
      for (const { job } of this.decryptQueue) {
        job.abort()
      }
      this.decryptQueue.clear()
      if (this.triggerStopped) {
        this.triggerStopped()
      }
    }
  }

  private async decryptLoop(): Promise<void> {
    while (this.isStarted) {
      if (this.decryptQueue.isEmpty() && this.triggerFlushed) {
        this.triggerFlushed()
        this.triggerFlushed = null
      }

      const item = await Promise.race([this.decryptQueue.pop(), this.onStopped])
      if (!item) {
        break
      }

      const { job, accounts, blockHeader, transactions, callback } = item

      let decryptNotesResponse
      try {
        decryptNotesResponse = await job.result()
      } catch (e) {
        if (e instanceof JobAbortedError) {
          break
        }
        throw e
      }

      if (!this.isStarted) {
        break
      }

      Assert.isInstanceOf(decryptNotesResponse, DecryptNotesResponse)
      const decryptedNotes = decryptNotesResponse.mapToAccounts(
        accounts.map((account) => ({ accountId: account.id })),
      )

      for (const { account, decryptedTransactions } of regroupNotes(
        accounts,
        transactions,
        decryptedNotes,
      )) {
        if (!this.isStarted) {
          break
        }
        await callback(account, blockHeader, decryptedTransactions)
      }
    }
  }

  /**
   * Waits for all the in flight decrypt requests to be fully processed.
   */
  async flush(): Promise<void> {
    if (!this.isStarted) {
      return
    }
    await this.onFlushed
  }

  decryptNotesFromBlock(
    blockHeader: BlockHeader,
    transactions: ReadonlyArray<Transaction>,
    accounts: ReadonlyArray<Account>,
    callback: DecryptNotesFromTransactionsCallback,
  ): Promise<void> {
    if (!this.isStarted) {
      throw new Error('decryptor was not started')
    }

    if (!this.triggerFlushed) {
      this.onFlushed = new Promise((resolve) => (this.triggerFlushed = resolve))
    }

    const accountKeys = accounts.map((account) => ({
      incomingViewKey: account.incomingViewKey,
      outgoingViewKey: account.outgoingViewKey,
      viewKey: account.viewKey,
    }))
    Assert.isNotNull(blockHeader.noteSize)

    const encryptedNotes = []
    let currentNoteIndex = transactions
      .map((transaction) => transaction.notes.length)
      .reduce((accumulator, numNotes) => accumulator - numNotes, blockHeader.noteSize)

    for (const transaction of transactions) {
      for (const note of transaction.notes) {
        encryptedNotes.push({ serializedNote: note.serialize(), currentNoteIndex })
        currentNoteIndex++
      }
    }

    const decryptNotesRequest = new DecryptNotesRequest(
      accountKeys,
      encryptedNotes,
      this.options,
    )
    const job = this.workerPool.execute(decryptNotesRequest)

    return this.decryptQueue.push({
      job,
      accounts,
      blockHeader,
      transactions,
      callback,
    })
  }
}

/**
 * Reassociates each decrypted note to its corresponding transaction.
 */
function* regroupNotes(
  accounts: ReadonlyArray<Account>,
  transactions: ReadonlyArray<Transaction>,
  decryptedNotes: ReadonlyMap<string, ReadonlyArray<DecryptedNote | null>>,
): Generator<{
  account: Account
  decryptedTransactions: Array<{
    transaction: Transaction
    decryptedNotes: Array<DecryptedNote>
  }>
}> {
  for (const account of accounts) {
    let notesOffset = 0
    const flatNotes: ReadonlyArray<DecryptedNote | null> = decryptedNotes.get(account.id) ?? []
    const groupedNotes: Array<{
      transaction: Transaction
      decryptedNotes: Array<DecryptedNote>
    }> = []

    for (const transaction of transactions) {
      const decryptedNotes = flatNotes
        .slice(notesOffset, notesOffset + transaction.notes.length)
        .filter((note) => note !== null) as Array<DecryptedNote>
      groupedNotes.push({ transaction, decryptedNotes })
      notesOffset += transaction.notes.length
    }

    yield { account, decryptedTransactions: groupedNotes }
  }
}
