/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../../assert'
import { Config } from '../../fileStores'
import { BlockHeader } from '../../primitives'
import { Transaction } from '../../primitives/transaction'
import { AsyncQueue } from '../../utils/asyncQueue'
import { PromiseUtils } from '../../utils/promise'
import { WorkerPool } from '../../workerPool'
import { Job } from '../../workerPool/job'
import {
  DecryptedNote,
  DecryptNotesOptions,
  DecryptNotesRequest,
  DecryptNotesResponse,
  DecryptNotesSharedAccountKeys,
} from '../../workerPool/tasks/decryptNotes'
import { JobAbortedError } from '../../workerPool/tasks/jobAbort'
import { Account } from '../account/account'

export type DecryptNotesFromTransactionsCallback = (
  account: Account,
  blockHeader: BlockHeader,
  transactions: Array<{ transaction: Transaction; decryptedNotes: Array<DecryptedNote> }>,
) => Promise<void>

type DecryptQueueItem = {
  job: Job
  blockHeader: BlockHeader
  transactions: ReadonlyArray<Transaction>
  accounts: ReadonlyArray<Account>
  callback: DecryptNotesFromTransactionsCallback
}

export class BackgroundNoteDecryptor {
  private isStarted = false

  private triggerFlushed: (() => void) | null = null
  private triggerStopped: (() => void) | null = null

  private onFlushed: Promise<void> = Promise.resolve()
  private onStopped: Promise<void> = Promise.resolve()

  private readonly workerPool: WorkerPool
  private readonly options: DecryptNotesOptions
  private readonly decryptQueue: AsyncQueue<DecryptQueueItem>

  private accounts: ReadonlyArray<Account>
  private sharedAccountKeys: DecryptNotesSharedAccountKeys

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

    this.accounts = []
    this.sharedAccountKeys = new DecryptNotesSharedAccountKeys([])
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
    let resolve: (value: DecryptQueueItem | void) => unknown
    let reject: (reason?: unknown) => void

    this.onStopped.then(
      (value) => resolve?.(value),
      (err) => reject?.(err),
    )

    while (this.isStarted) {
      if (this.decryptQueue.isEmpty() && this.triggerFlushed) {
        this.triggerFlushed()
        this.triggerFlushed = null
      }

      const [promise, resolveNew, rejectNew] = PromiseUtils.split<DecryptQueueItem | void>()
      resolve = resolveNew
      reject = rejectNew

      this.decryptQueue.pop().then(
        (value) => resolve(value),
        (err) => reject(err),
      )

      const item = await promise
      if (!item) {
        break
      }

      const { job, blockHeader, transactions, accounts, callback } = item

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

    this.updateAccounts(accounts)

    if (!this.triggerFlushed) {
      this.onFlushed = new Promise((resolve) => (this.triggerFlushed = resolve))
    }

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
      this.sharedAccountKeys,
      encryptedNotes,
      this.options,
    )
    const job = this.workerPool.execute(decryptNotesRequest)

    return this.decryptQueue.push({
      job,
      blockHeader,
      transactions,
      accounts: this.accounts,
      callback,
    })
  }

  private updateAccounts(newAccounts: ReadonlyArray<Account>) {
    if (
      newAccounts.length === this.accounts.length &&
      newAccounts.every((account, index) => account === this.accounts[index])
    ) {
      // No change
      return
    }

    // Because `decryptLoop` does not use `this.accounts` or
    // `this.sharedAccountKeys` directly, we can swap their value without the
    // need to flush the queue. This is safe as long as the value is not
    // mutated.
    this.accounts = newAccounts
    this.sharedAccountKeys = new DecryptNotesSharedAccountKeys(
      newAccounts.map((account) => ({
        incomingViewKey: Buffer.from(account.incomingViewKey, 'hex'),
        outgoingViewKey: Buffer.from(account.outgoingViewKey, 'hex'),
        viewKey: Buffer.from(account.viewKey, 'hex'),
      })),
    )
  }
}

/**
 * Reassociates each decrypted note to its corresponding transaction.
 */
function* regroupNotes(
  accounts: ReadonlyArray<Account>,
  transactions: ReadonlyArray<Transaction>,
  decryptedNotes: ReadonlyMap<string, ReadonlyArray<DecryptedNote | undefined>>,
): Generator<{
  account: Account
  decryptedTransactions: Array<{
    transaction: Transaction
    decryptedNotes: Array<DecryptedNote>
  }>
}> {
  for (const account of accounts) {
    let notesOffset = 0
    const flatNotes: ReadonlyArray<DecryptedNote | undefined> =
      decryptedNotes.get(account.id) ?? []
    const groupedNotes: Array<{
      transaction: Transaction
      decryptedNotes: Array<DecryptedNote>
    }> = []

    for (const transaction of transactions) {
      const decryptedNotes = flatNotes
        .slice(notesOffset, notesOffset + transaction.notes.length)
        .filter((note) => note !== undefined) as Array<DecryptedNote>
      groupedNotes.push({ transaction, decryptedNotes })
      notesOffset += transaction.notes.length
    }

    yield { account, decryptedTransactions: groupedNotes }
  }
}
