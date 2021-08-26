/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { Side } from '../merkletree/merkletree'
import type {
  BoxMessageRequest,
  CreateMinersFeeRequest,
  CreateTransactionRequest,
  MineHeaderRequest,
  SleepRequest,
  TransactionFeeRequest,
  UnboxMessageRequest,
  VerifyTransactionRequest,
} from './tasks'
import _ from 'lodash'
import { Meter, MetricsMonitor } from '../metrics'
import { Identity, PrivateIdentity } from '../network'
import { Note } from '../primitives/note'
import { Transaction } from '../primitives/transaction'
import { Job } from './job'
import { WorkerRequest } from './messages'
import { getWorkerPath, Worker } from './worker'

/**
 * Manages the creation of worker threads and distribution of jobs to them.
 */
export class WorkerPool {
  readonly maxJobs: number
  readonly maxQueue: number
  readonly maxWorkers: number

  queue: Array<Job> = []
  workers: Array<Worker> = []
  started = false
  completed = 0
  change: Meter | null
  speed: Meter | null

  private lastJobId = 0

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
    maxWorkers?: number
    maxQueue?: number
    maxJobs?: number
  }) {
    this.maxWorkers = options?.maxWorkers ?? 1
    this.maxJobs = options?.maxJobs ?? 1
    this.maxQueue = options?.maxQueue ?? 200
    this.change = options?.metrics?.addMeter() ?? null
    this.speed = options?.metrics?.addMeter() ?? null
  }

  start(): void {
    if (this.started) {
      return
    }

    this.started = true

    const path = getWorkerPath()

    for (let i = 0; i < this.maxWorkers; i++) {
      const worker = new Worker({ path, maxJobs: this.maxJobs })
      this.workers.push(worker)
    }
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
  ): Promise<Transaction> {
    const request: CreateTransactionRequest = {
      type: 'createTransaction',
      spendKey,
      transactionFee,
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

  async verify(transaction: Transaction): Promise<boolean> {
    const request: VerifyTransactionRequest = {
      type: 'verify',
      serializedTransactionPosted: transaction.serialize(),
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

  async mineHeader(
    miningRequestId: number,
    headerBytesWithoutRandomness: Buffer,
    initialRandomness: number,
    targetValue: string,
    batchSize: number,
  ): Promise<{ initialRandomness: number; miningRequestId?: number; randomness?: number }> {
    const request: MineHeaderRequest = {
      type: 'mineHeader',
      headerBytesWithoutRandomness,
      miningRequestId,
      initialRandomness,
      targetValue,
      batchSize,
    }

    const response = await this.execute(request).result()

    if (response === null || response.type !== request.type) {
      throw new Error('Response type must match request type')
    }

    return {
      initialRandomness: response.initialRandomness,
      miningRequestId: response.miningRequestId,
      randomness: response.randomness,
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

    return this.execute(request)
  }

  private execute(request: Readonly<WorkerRequest>): Job {
    const jobId = this.lastJobId++
    const job = new Job({ jobId: jobId, body: request })
    job.ended.once(this.jobEnded)

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
}
