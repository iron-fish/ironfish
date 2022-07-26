/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { Side } from '../merkletree/merkletree'
import _ from 'lodash'
import { VerificationResult, VerificationResultReason } from '../consensus'
import { createRootLogger, Logger } from '../logger'
import { Meter, MetricsMonitor } from '../metrics'
import { Identity, PrivateIdentity } from '../network'
import { Note } from '../primitives/note'
import { Transaction } from '../primitives/transaction'
import { Metric } from '../telemetry/interfaces/metric'
import { WorkerMessageStats } from './interfaces/workerMessageStats'
import { Job } from './job'
import { RoundRobinQueue } from './roundRobinQueue'
import { BoxMessageRequest, BoxMessageResponse } from './tasks/boxMessage'
import { CreateMinersFeeRequest, CreateMinersFeeResponse } from './tasks/createMinersFee'
import { CreateTransactionRequest, CreateTransactionResponse } from './tasks/createTransaction'
import {
  DecryptedNote,
  DecryptNoteOptions,
  DecryptNotesRequest,
  DecryptNotesResponse,
} from './tasks/decryptNotes'
import { GetUnspentNotesRequest, GetUnspentNotesResponse } from './tasks/getUnspentNotes'
import { SleepRequest } from './tasks/sleep'
import { SubmitTelemetryRequest } from './tasks/submitTelemetry'
import { UnboxMessageRequest, UnboxMessageResponse } from './tasks/unboxMessage'
import {
  VerifyTransactionOptions,
  VerifyTransactionRequest,
  VerifyTransactionResponse,
} from './tasks/verifyTransaction'
import {
  VerifyTransactionsRequest,
  VerifyTransactionsResponse,
} from './tasks/verifyTransactions'
import { WorkerMessage, WorkerMessageType } from './tasks/workerMessage'
import { getWorkerPath, Worker } from './worker'

/**
 * Manages the creation of worker threads and distribution of jobs to them.
 */
export class WorkerPool {
  readonly maxJobs: number
  readonly maxQueue: number
  readonly numWorkers: number
  readonly logger: Logger

  queue = new RoundRobinQueue()
  workers: Array<Worker> = []
  started = false
  completed = 0
  change: Meter | null
  speed: Meter | null

  readonly stats = new Map<WorkerMessageType, WorkerMessageStats>([
    [WorkerMessageType.BoxMessage, { complete: 0, error: 0, queue: 0, execute: 0 }],
    [WorkerMessageType.CreateMinersFee, { complete: 0, error: 0, queue: 0, execute: 0 }],
    [WorkerMessageType.CreateTransaction, { complete: 0, error: 0, queue: 0, execute: 0 }],
    [WorkerMessageType.DecryptNotes, { complete: 0, error: 0, queue: 0, execute: 0 }],
    [WorkerMessageType.GetUnspentNotes, { complete: 0, error: 0, queue: 0, execute: 0 }],
    [WorkerMessageType.JobAborted, { complete: 0, error: 0, queue: 0, execute: 0 }],
    [WorkerMessageType.Sleep, { complete: 0, error: 0, queue: 0, execute: 0 }],
    [WorkerMessageType.SubmitTelemetry, { complete: 0, error: 0, queue: 0, execute: 0 }],
    [WorkerMessageType.UnboxMessage, { complete: 0, error: 0, queue: 0, execute: 0 }],
    [WorkerMessageType.VerifyTransaction, { complete: 0, error: 0, queue: 0, execute: 0 }],
    [WorkerMessageType.VerifyTransactions, { complete: 0, error: 0, queue: 0, execute: 0 }],
  ])

  get saturated(): boolean {
    return this.queue.length >= this.maxQueue
  }

  get executing(): number {
    return _.sumBy(this.workers, (w) => w.jobs.size)
  }

  get queued(): number {
    return this.queue.length
  }

  get capacity(): number {
    return this.workers.length * this.maxJobs
  }

  constructor(options?: {
    metrics?: MetricsMonitor
    numWorkers?: number
    maxQueue?: number
    maxJobs?: number
    logger?: Logger
  }) {
    this.numWorkers = options?.numWorkers ?? 1
    this.maxJobs = options?.maxJobs ?? 1
    this.maxQueue = options?.maxQueue ?? 500
    this.change = options?.metrics?.addMeter() ?? null
    this.speed = options?.metrics?.addMeter() ?? null
    this.logger = options?.logger ?? createRootLogger()
  }

  start(): void {
    if (this.started) {
      return
    }

    this.started = true

    const path = getWorkerPath()

    for (let i = 0; i < this.numWorkers; i++) {
      const worker = new Worker({ path, maxJobs: this.maxJobs })
      this.workers.push(worker)
    }

    this.logger.debug(`Started worker pool with ${this.numWorkers} workers using ${path}`)
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return
    }

    this.started = false

    const workers = this.workers
    const queue = this.queue

    this.workers = []

    queue.abortAll()

    await Promise.all(workers.map((w) => w.stop()))
  }

  async createMinersFee(spendKey: string, amount: bigint, memo: string): Promise<Transaction> {
    const request = new CreateMinersFeeRequest(amount, memo, spendKey)

    const response = await this.execute(request).result()

    if (!(response instanceof CreateMinersFeeResponse)) {
      throw new Error('Invalid response')
    }

    return new Transaction(Buffer.from(response.serializedTransactionPosted))
  }

  async createTransaction(
    spendKey: string,
    transactionFee: bigint,
    spends: {
      note: Note
      treeSize: number
      rootHash: Buffer
      authPath: {
        side: Side
        hashOfSibling: Buffer
      }[]
    }[],
    receives: { publicAddress: string; amount: bigint; memo: string }[],
    expirationSequence: number,
  ): Promise<Transaction> {
    const spendsWithSerializedNotes = spends.map((s) => ({
      ...s,
      note: s.note.serialize(),
    }))
    const request: CreateTransactionRequest = new CreateTransactionRequest(
      spendKey,
      transactionFee,
      expirationSequence,
      spendsWithSerializedNotes,
      receives,
    )

    const response = await this.execute(request).result()

    if (!(response instanceof CreateTransactionResponse)) {
      throw new Error('Invalid response')
    }

    return new Transaction(Buffer.from(response.serializedTransactionPosted))
  }

  async verify(
    transaction: Transaction,
    options?: VerifyTransactionOptions,
  ): Promise<VerificationResult> {
    const request: VerifyTransactionRequest = new VerifyTransactionRequest(
      transaction.serialize(),
      options,
    )

    const response = await this.execute(request).result()
    if (!(response instanceof VerifyTransactionResponse)) {
      throw new Error('Invalid response')
    }

    return response.verified
      ? { valid: true }
      : { valid: false, reason: VerificationResultReason.ERROR }
  }

  // TODO: verify fees?
  async verifyTransactions(transactions: Array<Transaction>): Promise<VerificationResult> {
    const txs = transactions.map((tx) => tx.serialize())
    const request: VerifyTransactionsRequest = new VerifyTransactionsRequest(txs)

    const response = await this.execute(request).result()
    if (!(response instanceof VerifyTransactionsResponse)) {
      throw new Error('Invalid response')
    }

    return response.verified
      ? { valid: true }
      : { valid: false, reason: VerificationResultReason.ERROR }
  }

  async boxMessage(
    plainTextMessage: string,
    sender: PrivateIdentity,
    recipient: Identity,
  ): Promise<{ nonce: string; boxedMessage: string }> {
    const request: BoxMessageRequest = new BoxMessageRequest(
      plainTextMessage,
      sender,
      recipient,
    )

    const response = await this.execute(request).result()
    if (!(response instanceof BoxMessageResponse)) {
      throw new Error('Invalid response')
    }

    return { nonce: response.nonce, boxedMessage: response.boxedMessage }
  }

  async unboxMessage(
    boxedMessage: string,
    nonce: string,
    sender: Identity,
    recipient: PrivateIdentity,
  ): Promise<UnboxMessageResponse> {
    const request = new UnboxMessageRequest(boxedMessage, nonce, sender, recipient)

    const response = await this.execute(request).result()

    if (!(response instanceof UnboxMessageResponse)) {
      throw new Error('Invalid response')
    }

    return response
  }

  async decryptNotes(payloads: DecryptNoteOptions[]): Promise<Array<DecryptedNote | null>> {
    const request = new DecryptNotesRequest(payloads)

    const response = await this.execute(request).result()
    if (!(response instanceof DecryptNotesResponse)) {
      throw new Error('Invalid response')
    }

    return response.notes
  }

  async getUnspentNotes(
    serializedTransactionPosted: Buffer,
    accountIncomingViewKeys: Array<string>,
  ): Promise<{
    notes: ReadonlyArray<{
      account: string
      hash: string
      note: Buffer
    }>
  }> {
    const request = new GetUnspentNotesRequest(
      serializedTransactionPosted,
      accountIncomingViewKeys,
    )

    const response = await this.execute(request).result()

    if (!(response instanceof GetUnspentNotesResponse)) {
      throw new Error('Invalid response')
    }

    return {
      notes: response.notes,
    }
  }

  /**
   * A test worker task that sleeps for specified milliseconds
   */
  sleep(sleep = 0, error = ''): Job {
    const request = new SleepRequest(sleep, error)

    const job = this.execute(request)
    job.enableJobAbortedError = true

    return job
  }

  async submitTelemetry(points: Metric[], graffiti: Buffer): Promise<void> {
    const request = new SubmitTelemetryRequest(points, graffiti)

    await this.execute(request).result()
  }

  private execute(request: Readonly<WorkerMessage>): Job {
    const job = new Job(request)
    job.onEnded.once(this.jobEnded)
    job.onChange.on(this.jobChange)
    job.onChange.emit(job, 'init')

    // If there are no workers, execute in process
    if (this.workers.length === 0) {
      void job.execute()
      return job
    }

    this.change?.add(1)

    // If we already have queue, put it at the end of the queue
    if (this.queue.length > 0) {
      this.queue.enqueue(request.type, job)
      return job
    }

    const worker = this.workers.find((w) => w.canTakeJobs)

    if (!worker) {
      this.queue.enqueue(request.type, job)
      return job
    }

    worker.execute(job)
    return job
  }

  private executeQueue(): void {
    if (this.queue.length === 0) {
      return
    }

    const worker = this.workers.find((w) => w.canTakeJobs)
    if (!worker) {
      return
    }

    const job = this.queue.nextJob()
    if (!job) {
      return
    }

    worker.execute(job)
  }

  private jobEnded = (): void => {
    this.change?.add(-1)
    this.speed?.add(1)
    this.completed++
    this.executeQueue()
  }

  private jobChange = (job: Job, prevStatus: Job['status']): void => {
    const stats = this.stats.get(job.request.type)

    if (!stats) {
      return
    }

    switch (prevStatus) {
      case 'queued':
        stats.queue--
        break
      case 'executing':
        stats.execute--
        break
    }

    switch (job.status) {
      case 'queued':
        stats.queue++
        break
      case 'executing':
        stats.execute++
        break
      case 'aborted':
        stats.complete++
        break
      case 'success':
        stats.complete++
        break
      case 'error':
        stats.error++
        break
    }
  }
}
