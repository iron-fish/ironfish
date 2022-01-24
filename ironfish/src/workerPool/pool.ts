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
import { createRootLogger, Logger } from '../logger'
import { Meter, MetricsMonitor } from '../metrics'
import { Identity, PrivateIdentity } from '../network'
import { Note } from '../primitives/note'
import { Transaction } from '../primitives/transaction'
import { Job } from './job'
import { WorkerMessageType, WorkerRequest, WorkerRequestMessage } from './messages'
import {
  VerifyTransactionOptions,
  VerifyTransactionReq,
  VerifyTransactionResp,
} from './tasks/verifyTransaction'
import { getWorkerPath, Worker } from './worker'
import { CreateMinersFeeReq, CreateMinersFeeResp } from './tasks/createMinersFee'
import { CreateTransactionReq, CreateTransactionResp } from './tasks/createTransaction'
import { TransactionFeeReq, TransactionFeeResp } from './tasks/transactionFee'
import { BoxMessageReq, BoxMessageResp } from './tasks/boxMessage'
import { UnboxMessageReq, UnboxMessageResp } from './tasks/unboxMessage'
import { MineHeaderReq, MineHeaderResp } from './tasks/mineHeader'
import { SleepReq } from './tasks/sleep'

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
    WorkerMessageType,
    { complete: number; error: number; queue: number; execute: number }
  >([
    [WorkerMessageType.createMinersFee, { complete: 0, error: 0, queue: 0, execute: 0 }],
    [WorkerMessageType.verify, { complete: 0, error: 0, queue: 0, execute: 0 }],
    [WorkerMessageType.sleep, { complete: 0, error: 0, queue: 0, execute: 0 }],
    [WorkerMessageType.createTransaction, { complete: 0, error: 0, queue: 0, execute: 0 }],
    [WorkerMessageType.boxMessage, { complete: 0, error: 0, queue: 0, execute: 0 }],
    [WorkerMessageType.unboxMessage, { complete: 0, error: 0, queue: 0, execute: 0 }],
    [WorkerMessageType.mineHeader, { complete: 0, error: 0, queue: 0, execute: 0 }],
    [WorkerMessageType.transactionFee, { complete: 0, error: 0, queue: 0, execute: 0 }],
    [WorkerMessageType.jobAbort, { complete: 0, error: 0, queue: 0, execute: 0 }],
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
      type: WorkerMessageType.createMinersFee,
      spendKey,
      amount,
      memo,
    }

    const serializedRequest = CreateMinersFeeReq.serialize(request)

    const serializedResponse = await this.execute(request.type, serializedRequest).result()

    if (request.type !== serializedResponse.type) {
      throw new Error('Response type must match request type')
    }

    const response = new CreateMinersFeeResp(serializedResponse.body).deserialize()

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
      type: WorkerMessageType.createTransaction,
      spendKey,
      transactionFee,
      expirationSequence,
      spends: spends.map((s) => ({
        ...s,
        authPathLength: s.authPath.length,
        note: s.note.serialize(),
      })),
      receives,
      spendsLength: spends.length,
      receivesLength: receives.length,
    }

    const serializedRequest = CreateTransactionReq.serialize(request)
    const serializedResponse = await this.execute(request.type, serializedRequest).result()

    if (serializedResponse === null || serializedResponse.type !== request.type) {
      throw new Error('Response type must match request type')
    }

    const response = new CreateTransactionResp(serializedResponse.body).deserialize()

    return new Transaction(Buffer.from(response.serializedTransactionPosted), this)
  }

  async transactionFee(transaction: Transaction): Promise<bigint> {
    const request: TransactionFeeRequest = {
      type: WorkerMessageType.transactionFee,
      serializedTransactionPosted: transaction.serialize(),
    }

    const serializedRequest = TransactionFeeReq.serialize(request)
    const serializedResponse = await this.execute(request.type, serializedRequest).result()

    if (serializedResponse === null || serializedResponse.type !== request.type) {
      throw new Error('Response type must match request type')
    }

    const response = new TransactionFeeResp(serializedResponse.body).deserialize()

    return response.transactionFee
  }

  async verify(transaction: Transaction, options?: VerifyTransactionOptions): Promise<boolean> {
    const request: VerifyTransactionRequest = {
      type: WorkerMessageType.verify,
      serializedTransactionPosted: transaction.serialize(),
      options,
    }

    const serializedRequest = VerifyTransactionReq.serialize(request)
    const serializedResponse = await this.execute(request.type, serializedRequest).result()

    if (serializedResponse === null || serializedResponse.type !== request.type) {
      throw new Error('Response type must match request type')
    }

    const response = new VerifyTransactionResp(serializedResponse.body).deserialize()

    return response.verified
  }

  async boxMessage(
    plainTextMessage: string,
    sender: PrivateIdentity,
    recipient: Identity,
  ): Promise<{ nonce: string; boxedMessage: string }> {
    const request: BoxMessageRequest = {
      type: WorkerMessageType.boxMessage,
      message: plainTextMessage,
      sender: sender,
      recipient: recipient,
    }

    const serializedRequest = BoxMessageReq.serialize(request)
    const serializedResponse = await this.execute(request.type, serializedRequest).result()

    if (serializedResponse === null || serializedResponse.type !== request.type) {
      throw new Error('Response type must match request type')
    }

    const response = new BoxMessageResp(serializedResponse.body).deserialize()

    return { nonce: response.nonce, boxedMessage: response.boxedMessage }
  }

  async unboxMessage(
    boxedMessage: string,
    nonce: string,
    sender: Identity,
    recipient: PrivateIdentity,
  ): Promise<{ message: string | null }> {
    const request: UnboxMessageRequest = {
      type: WorkerMessageType.unboxMessage,
      boxedMessage: boxedMessage,
      nonce: nonce,
      recipient: recipient,
      sender: sender,
    }

    const serializedRequest = UnboxMessageReq.serialize(request)
    const serializedResponse = await this.execute(request.type, serializedRequest).result()

    if (serializedResponse === null || serializedResponse.type !== request.type) {
      throw new Error('Response type must match request type')
    }

    const response = new UnboxMessageResp(serializedResponse.body).deserialize()

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
      type: WorkerMessageType.mineHeader,
      headerBytesWithoutRandomness,
      miningRequestId,
      initialRandomness,
      targetValue,
      batchSize,
    }

    const serializedRequest = MineHeaderReq.serialize(request)
    const serializedResponse = await this.execute(request.type, serializedRequest).result()

    if (serializedResponse === null || serializedResponse.type !== request.type) {
      throw new Error('Response type must match request type')
    }

    const response = new MineHeaderResp(serializedResponse.body).deserialize()

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
      type: WorkerMessageType.sleep,
      sleep,
      error,
    }

    const serializedRequest = SleepReq.serialize(request)
    const job = this.execute(request.type, serializedRequest)
    job.enableJobAbortError = true

    return job
  }

  private execute(type: WorkerMessageType, request: Readonly<Buffer>): Job {
    const jobId = this.lastJobId++
    const job = new Job({ jobId: jobId, type, body: request })
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
