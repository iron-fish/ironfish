/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { getCpuCount, UnsignedTransaction } from '@ironfish/rust-nodejs'
import _ from 'lodash'
import { VerificationResult, VerificationResultReason } from '../consensus'
import { createRootLogger, Logger } from '../logger'
import { Meter, MetricsMonitor } from '../metrics'
import { RawTransaction } from '../primitives/rawTransaction'
import { Transaction, TransactionVersion } from '../primitives/transaction'
import { Metric } from '../telemetry/interfaces/metric'
import { WorkerMessageStats } from './interfaces/workerMessageStats'
import { Job } from './job'
import { RoundRobinQueue } from './roundRobinQueue'
import { BuildTransactionRequest, BuildTransactionResponse } from './tasks/buildTransaction'
import { CreateMinersFeeRequest, CreateMinersFeeResponse } from './tasks/createMinersFee'
import {
  DecryptedNote,
  DecryptNotesAccountKey,
  DecryptNotesItem,
  DecryptNotesOptions,
  DecryptNotesRequest,
  DecryptNotesResponse,
} from './tasks/decryptNotes'
import { PostTransactionRequest, PostTransactionResponse } from './tasks/postTransaction'
import { SleepRequest } from './tasks/sleep'
import { SubmitTelemetryRequest } from './tasks/submitTelemetry'
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
    [WorkerMessageType.CreateMinersFee, { complete: 0, error: 0, queue: 0, execute: 0 }],
    [WorkerMessageType.DecryptNotes, { complete: 0, error: 0, queue: 0, execute: 0 }],
    [WorkerMessageType.JobAborted, { complete: 0, error: 0, queue: 0, execute: 0 }],
    [WorkerMessageType.PostTransaction, { complete: 0, error: 0, queue: 0, execute: 0 }],
    [WorkerMessageType.Sleep, { complete: 0, error: 0, queue: 0, execute: 0 }],
    [WorkerMessageType.SubmitTelemetry, { complete: 0, error: 0, queue: 0, execute: 0 }],
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

  async createMinersFee(
    spendKey: string,
    amount: bigint,
    memo: Buffer,
    transactionVersion: TransactionVersion,
  ): Promise<Transaction> {
    const request = new CreateMinersFeeRequest(amount, memo, spendKey, transactionVersion)

    const response = await this.execute(request).result()

    if (!(response instanceof CreateMinersFeeResponse)) {
      throw new Error('Invalid response')
    }

    return new Transaction(Buffer.from(response.serializedTransactionPosted))
  }

  async buildTransaction(
    transaction: RawTransaction,
    proofAuthorizingKey: string,
    viewKey: string,
    outgoingViewKey: string,
  ): Promise<UnsignedTransaction> {
    const request = new BuildTransactionRequest(
      transaction,
      proofAuthorizingKey,
      viewKey,
      outgoingViewKey,
    )

    const response = await this.execute(request).result()

    if (!(response instanceof BuildTransactionResponse)) {
      throw new Error('Invalid response')
    }

    return response.transaction
  }

  async postTransaction(
    transaction: RawTransaction,
    spendingKey: string,
  ): Promise<Transaction> {
    const request = new PostTransactionRequest(transaction, spendingKey)

    const response = await this.execute(request).result()

    if (!(response instanceof PostTransactionResponse)) {
      throw new Error('Invalid response')
    }

    return response.transaction
  }

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

  async decryptNotes(
    accountKeys: ReadonlyArray<{ accountId: string } & DecryptNotesAccountKey>,
    encryptedNotes: ReadonlyArray<DecryptNotesItem>,
    options: DecryptNotesOptions,
  ): Promise<Map<string, Array<DecryptedNote | undefined>>> {
    const request = new DecryptNotesRequest(accountKeys, encryptedNotes, options)

    const response = await this.execute(request).result()
    if (!(response instanceof DecryptNotesResponse)) {
      throw new Error('Invalid response')
    }

    return response.mapToAccounts(accountKeys)
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

  async submitTelemetry(points: Metric[], graffiti: Buffer, apiHost: string): Promise<void> {
    const request = new SubmitTelemetryRequest(points, graffiti, apiHost)

    await this.execute(request).result()
  }

  execute(request: Readonly<WorkerMessage>): Job {
    // Ensure that workers are started before handling jobs
    this.start()

    const job = new Job(request)
    job.onEnded.once(this.jobEnded)
    job.onChange.on(this.jobChange)
    job.onChange.emit(job, 'init')

    // If there are no workers, execute in process. The previous call to
    // start() should ensure that the correct number of workers are started,
    // but the constructor allows numWorkers to be 0
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

    job.execute(worker)
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

    job.execute(worker)
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

/**
 * Calculates the number of workers to use based on machine's number of cpus
 */
export function calculateWorkers(nodeWorkers: number, nodeWorkersMax: number): number {
  if (nodeWorkers >= 0) {
    // If `nodeWorkers` is explicitly set, use that. We intentionally ignore
    // `nodeWorkersMax` because this is the original behavior when
    // `nodeWorkersMax` was first introduced, and changing that would be a
    // backwards-incompatible change.
    return nodeWorkers
  }

  // `nodeWorkers` was not provided. Calculate an optimal value, without
  // exceeding `nodeWorkersMax` (if provided).
  //
  // The -1 in the calculation for both `workers` and `maxWorkers` is to allow
  // room to the node main process, as well as to reduce the impact on the
  // user's system responsiveness
  //
  // `maxWorkers` is capped at 16 because each worker can consume several MiB
  // of memory, and this can cause issues on systems with many CPUs but limited
  // amount of memory. Also, even on systems with enough memory, increasing the
  // worker pool beyond certain limits is unlikely to improve performance, so
  // there is no concrete benefit in using as many workers as possible.
  const { availableParallelism, physicalCount } = getCpuCount()
  const workers = nodeWorkers >= 0 ? nodeWorkers : availableParallelism - 1
  const maxWorkers = nodeWorkersMax >= 0 ? nodeWorkersMax : Math.min(physicalCount, 16)

  return Math.min(workers, maxWorkers)
}
