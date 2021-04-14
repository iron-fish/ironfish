/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { IronfishTransaction } from '../strategy'
import * as worker from './worker'
import { Worker } from 'worker_threads'
import type {
  OmitRequestId,
  TransactionFeeRequest,
  VerifyTransactionRequest,
  WorkerRequest,
  WorkerResponse,
} from './messages'

/**
 * Manages the creation of worker threads and distribution of jobs to them.
 */
export class WorkerPool {
  private readonly resolvers: Map<number, (response: WorkerResponse) => void> = new Map<
    number,
    (response: WorkerResponse) => void
  >()
  private workers: Array<Worker> = []

  private _started = false
  public get started(): boolean {
    return this._started
  }

  private workerIndex = 0
  private lastRequestId = 0

  private sendRequest(
    request: Readonly<OmitRequestId<WorkerRequest>>,
  ): Promise<WorkerResponse | null> {
    const requestId = this.lastRequestId++

    const requestWithId = { ...request, requestId }

    if (this.workers.length === 0) {
      return Promise.resolve(worker.handleRequest(requestWithId))
    }

    return this.promisifyRequest(requestWithId)
  }

  /**
   * Send a request to the worker thread,
   * giving it an id and constructing a promise that can be resolved
   * when the worker thread has issued a response message.
   */
  private promisifyRequest(request: Readonly<WorkerRequest>): Promise<WorkerResponse> {
    const promise: Promise<WorkerResponse> = new Promise((resolve) => {
      this.resolvers.set(request.requestId, (posted) => resolve(posted))
    })

    this.workerIndex = (this.workerIndex + 1) % this.workers.length
    this.workers[this.workerIndex].postMessage(request)

    return promise
  }

  promisifyResponse(response: WorkerResponse): void {
    const resolver = this.resolvers.get(response.requestId)
    if (resolver) {
      this.resolvers.delete(response.requestId)
      resolver(response)
    }
  }

  start(workers: number): WorkerPool {
    if (this.started) {
      return this
    }

    this._started = true

    // Works around different paths when run under ts-jest
    let dir = __dirname
    if (dir.includes('ironfish/src/workerPool')) {
      dir = dir.replace('ironfish/src/workerPool', 'ironfish/build/src/workerPool')
    }

    for (let i = 0; i < workers; i++) {
      const worker = new Worker(dir + '/worker.js')
      worker.on('message', (value) => this.promisifyResponse(value))
      this.workers.push(worker)
    }

    return this
  }

  async stop(): Promise<undefined> {
    await Promise.all(this.workers.map((w) => w.terminate()))
    this.workers = []
    this.resolvers.clear()
    this._started = false
    return
  }

  async transactionFee(transaction: IronfishTransaction): Promise<bigint> {
    const request: OmitRequestId<TransactionFeeRequest> = {
      type: 'transactionFee',
      serializedTransactionPosted: transaction.serialize(),
    }

    const response = await this.sendRequest(request)

    if (response === null || response.type !== request.type) {
      throw new Error('Response type must match request type')
    }

    return response.transactionFee
  }

  async verify(transaction: IronfishTransaction): Promise<boolean> {
    const request: OmitRequestId<VerifyTransactionRequest> = {
      type: 'verify',
      serializedTransactionPosted: transaction.serialize(),
    }

    const response = await this.sendRequest(request)

    if (response === null || response.type !== request.type) {
      throw new Error('Response type must match request type')
    }

    return response.verified
  }
}
