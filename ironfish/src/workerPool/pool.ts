/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { Side } from '../merkletree/merkletree'
import type {
  BoxMessageRequest,
  CreateMinersFeeRequest,
  CreateTransactionRequest,
  GetUnspentNotesRequest,
  SleepRequest,
  TransactionFeeRequest,
  UnboxMessageRequest,
  VerifyTransactionRequest,
} from './tasks'
import _ from 'lodash'
import { createRootLogger, Logger } from '../logger'
import { Meter, MetricsMonitor } from '../metrics'
import { Identity, PrivateIdentity } from '../network'
import { Note } from '../primitives/note'
import { Transaction } from '../primitives/transaction'
import { Metric } from '../telemetry/interfaces/metric'
import { Job } from './job'
import { WorkerRequest } from './messages'
import { SubmitTelemetryRequest } from './tasks/submitTelemetry'
import { VerifyTransactionOptions } from './tasks/verifyTransaction'
import { getWorkerPath, Worker } from './worker'

/**
 * Manages the creation of worker threads and distribution of jobs to them.
 */
export class WorkerPool {
  readonly maxJobs: number
  readonly maxQueue: number
  readonly numWorkers: number
  readonly logger: Logger

  queue: Array<Job> = []
  workers: Array<Worker> = []
  started = false
  completed = 0
  change: Meter | null
  speed: Meter | null

  private lastJobId = 0

  readonly stats = new Map<
    WorkerRequest['type'],
    { complete: number; error: number; queue: number; execute: number }
  >([
    ['createMinersFee', { complete: 0, error: 0, queue: 0, execute: 0 }],
    ['verify', { complete: 0, error: 0, queue: 0, execute: 0 }],
    ['sleep', { complete: 0, error: 0, queue: 0, execute: 0 }],
    ['createTransaction', { complete: 0, error: 0, queue: 0, execute: 0 }],
    ['getUnspentNotes', { complete: 0, error: 0, queue: 0, execute: 0 }],
    ['boxMessage', { complete: 0, error: 0, queue: 0, execute: 0 }],
    ['unboxMessage', { complete: 0, error: 0, queue: 0, execute: 0 }],
    ['transactionFee', { complete: 0, error: 0, queue: 0, execute: 0 }],
    ['jobAbort', { complete: 0, error: 0, queue: 0, execute: 0 }],
    ['submitTelemetry', { complete: 0, error: 0, queue: 0, execute: 0 }],
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
    this.maxQueue = options?.maxQueue ?? 200
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
    this.queue = []

    queue.forEach((j) => j.abort())
    await Promise.all(workers.map((w) => w.stop()))
  }

  async createMinersFee(spendKey: string, amount: bigint, memo: string): Promise<Transaction> {
    const request: CreateMinersFeeRequest = {
      type: 'createMinersFee',
      spendKey,
      amount,
      memo,
    }

    const response = await this.execute(request).result()

    if (request.type !== response.type) {
      throw new Error('Response type must match request type')
    }

    return new Transaction(Buffer.from(response.serializedTransactionPosted), this)
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
    const request: CreateTransactionRequest = {
      type: 'createTransaction',
      spendKey,
      transactionFee,
      expirationSequence,
      spends: spends.map((s) => ({
        ...s,
        note: s.note.serialize(),
      })),
      receives,
    }

    const response = await this.execute(request).result()

    if (response === null || response.type !== request.type) {
      throw new Error('Response type must match request type')
    }

    return new Transaction(Buffer.from(response.serializedTransactionPosted), this)
  }

  async transactionFee(transaction: Transaction): Promise<bigint> {
    const request: TransactionFeeRequest = {
      type: 'transactionFee',
      serializedTransactionPosted: transaction.serialize(),
    }

    const response = await this.execute(request).result()

    if (response === null || response.type !== request.type) {
      throw new Error('Response type must match request type')
    }

    return response.transactionFee
  }

  async verify(transaction: Transaction, options?: VerifyTransactionOptions): Promise<boolean> {
    const request: VerifyTransactionRequest = {
      type: 'verify',
      serializedTransactionPosted: transaction.serialize(),
      options,
    }

    const response = await this.execute(request).result()

    if (response === null || response.type !== request.type) {
      throw new Error('Response type must match request type')
    }

    return response.verified
  }

  async boxMessage(
    plainTextMessage: string,
    sender: PrivateIdentity,
    recipient: Identity,
  ): Promise<{ nonce: string; boxedMessage: string }> {
    const request: BoxMessageRequest = {
      type: 'boxMessage',
      message: plainTextMessage,
      sender: sender,
      recipient: recipient,
    }

    const response = await this.execute(request).result()

    if (response === null || response.type !== request.type) {
      throw new Error('Response type must match request type')
    }

    return { nonce: response.nonce, boxedMessage: response.boxedMessage }
  }

  async unboxMessage(
    boxedMessage: string,
    nonce: string,
    sender: Identity,
    recipient: PrivateIdentity,
  ): Promise<{ message: string | null }> {
    const request: UnboxMessageRequest = {
      type: 'unboxMessage',
      boxedMessage: boxedMessage,
      nonce: nonce,
      recipient: recipient,
      sender: sender,
    }

    const response = await this.execute(request).result()

    if (response === null || response.type !== request.type) {
      throw new Error('Response type must match request type')
    }

    return { message: response.message }
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
    const request: GetUnspentNotesRequest = {
      type: 'getUnspentNotes',
      serializedTransactionPosted,
      accounts: accountIncomingViewKeys,
    }

    const response = await this.execute(request).result()

    if (response === null || response.type !== request.type) {
      throw new Error('Response type must match request type')
    }

    return {
      notes: response.notes,
    }
  }

  /**
   * A test worker task that sleeps for specicifed milliseconds
   */
  sleep(sleep = 0, error = ''): Job {
    const request: SleepRequest = {
      type: 'sleep',
      sleep,
      error,
    }

    const job = this.execute(request)
    job.enableJobAbortError = true

    return job
  }

  async submitTelemetry(points: Metric[]): Promise<void> {
    const request: SubmitTelemetryRequest = {
      type: 'submitTelemetry',
      points,
    }

    await this.execute(request).result()
  }

  private execute(request: Readonly<WorkerRequest>): Job {
    const jobId = this.lastJobId++
    const job = new Job({ jobId: jobId, body: request })
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
      this.queue.push(job)
      return job
    }

    const worker = this.workers.find((w) => w.canTakeJobs)

    if (!worker) {
      this.queue.push(job)
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

    const job = this.queue.shift()
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
    const stats = this.stats.get(job.request.body.type)

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
