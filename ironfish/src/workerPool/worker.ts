/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { initializeSapling } from '@ironfish/rust-nodejs'
import path from 'path'
import { MessagePort, parentPort, Worker as WorkerThread } from 'worker_threads'
import { Assert } from '../assert'
import { createRootLogger, Logger } from '../logger'
import { WorkerHeader } from './interfaces/workerHeader'
import { Job } from './job'
import { CreateMinersFeeRequest, CreateMinersFeeResponse } from './tasks/createMinersFee'
import { DecryptNotesRequest, DecryptNotesResponse } from './tasks/decryptNotes'
import { JobAbortedError, JobAbortedMessage } from './tasks/jobAbort'
import { JobError, JobErrorMessage } from './tasks/jobError'
import { PostTransactionRequest, PostTransactionResponse } from './tasks/postTransaction'
import { SleepRequest, SleepResponse } from './tasks/sleep'
import { SubmitTelemetryRequest, SubmitTelemetryResponse } from './tasks/submitTelemetry'
import {
  VerifyTransactionsRequest,
  VerifyTransactionsResponse,
} from './tasks/verifyTransactions'
import { WorkerMessage, WorkerMessageType } from './tasks/workerMessage'

export class Worker {
  thread: WorkerThread | null = null
  parent: MessagePort | null = null
  path: string
  jobs: Map<number, Job>
  maxJobs: number
  started: boolean
  logger: Logger

  get executing(): boolean {
    return this.jobs.size > 0
  }

  get canTakeJobs(): boolean {
    return this.jobs.size < this.maxJobs
  }

  constructor(options: {
    parent?: MessagePort
    path?: string
    maxJobs?: number
    logger?: Logger
  }) {
    this.path = options.path ?? ''
    this.maxJobs = options.maxJobs ?? 1
    this.parent = options.parent ?? null
    this.jobs = new Map<number, Job>()
    this.started = true
    this.logger = options.logger || createRootLogger()

    if (options.parent) {
      this.spawned()
    } else {
      this.spawn()
    }
  }

  send(message: WorkerMessage): void {
    if (this.thread) {
      this.thread.postMessage(message.serialize())
    } else if (this.parent) {
      this.parent.postMessage(message.serialize())
    } else {
      throw new Error(`Cannot send message: no thread or worker`)
    }
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return
    }

    this.started = false

    const jobs = Array.from(this.jobs.values())
    this.jobs.clear()

    for (const job of jobs) {
      job.abort()
    }

    if (this.thread) {
      this.thread.removeAllListeners()
      await this.thread.terminate()
      this.thread = null
    }

    if (this.parent) {
      this.parent.removeAllListeners()
      this.parent = null
    }
  }

  /**
   * Called from the main process to spawn a worker thread
   */
  private spawn() {
    Assert.isNull(this.parent)
    this.thread = new WorkerThread(this.path)
    this.thread.on('message', this.onMessageFromWorker)
  }

  /**
   * Called from the worker thread once the worker spawns in the thread
   */
  private spawned() {
    Assert.isNotNull(this.parent)
    this.parent.on('message', this.onMessageFromParent)

    // Trigger loading of Sapling parameters if we're in a worker thread
    initializeSapling()
  }

  private onMessageFromParent = (request: Uint8Array): void => {
    const message = Buffer.from(request)

    let header: WorkerHeader
    try {
      header = WorkerMessage.deserializeHeader(message)
    } catch {
      this.logger.error(`Could not parse header from request: '${message.toString('hex')}'`)
      return
    }

    const { body, jobId, type } = header

    let requestBody: WorkerMessage
    try {
      requestBody = this.parseRequest(jobId, type, body)
    } catch {
      const args = `(jobId: ${jobId}, type: ${WorkerMessageType[type]}, body: '${body.toString(
        'hex',
      )}')`
      this.logger.error(`Could not parse payload from request: ${args}`)
      return
    }

    if (type === WorkerMessageType.JobAborted) {
      const job = this.jobs.get(jobId)
      if (job) {
        this.jobs.delete(job.id)
        job.abort()
      }
      return
    }

    const job = new Job(requestBody)
    this.jobs.set(job.id, job)

    job
      .execute()
      .result()
      .then((response: WorkerMessage) => {
        this.send(response)
      })
      .catch((e: unknown) => {
        this.send(new JobErrorMessage(job.id, e))
      })
      .finally(() => {
        this.jobs.delete(job.id)
      })
  }

  private onMessageFromWorker = (response: Uint8Array): void => {
    const message = Buffer.from(response)

    let header: WorkerHeader
    try {
      header = WorkerMessage.deserializeHeader(message)
    } catch {
      this.logger.error(`Could not parse header from response: '${message.toString('hex')}'`)
      return
    }

    const { body, jobId, type } = header
    const job = this.jobs.get(jobId)
    this.jobs.delete(jobId)

    if (!job) {
      return
    }

    const prevStatus = job.status
    job.status = 'success'
    job.onChange.emit(job, prevStatus)
    job.onEnded.emit(job)

    let result: WorkerMessage | JobError | JobAbortedError
    try {
      result = this.parseResponse(jobId, type, body)
    } catch {
      const args = `(jobId: ${jobId}, type: ${WorkerMessageType[type]}, body: '${body.toString(
        'hex',
      )}')`
      this.logger.error(`Could not parse payload from response: ${args}`)
      return
    }

    if (result instanceof JobError) {
      job.status = 'error'
      job.reject(result)
      return
    } else if (result instanceof JobAbortedError) {
      job.status = 'aborted'
      job.reject(result)
      return
    }

    job.resolve(result)
    return
  }

  private parseRequest(jobId: number, type: WorkerMessageType, request: Buffer): WorkerMessage {
    switch (type) {
      case WorkerMessageType.CreateMinersFee:
        return CreateMinersFeeRequest.deserializePayload(jobId, request)
      case WorkerMessageType.PostTransaction:
        return PostTransactionRequest.deserializePayload(jobId, request)
      case WorkerMessageType.DecryptNotes:
        return DecryptNotesRequest.deserializePayload(jobId, request)
      case WorkerMessageType.JobAborted:
        throw new Error('JobAbort should not be sent as a request')
      case WorkerMessageType.JobError:
        throw new Error('JobError should not be sent as a request')
      case WorkerMessageType.Sleep:
        return SleepRequest.deserializePayload(jobId, request)
      case WorkerMessageType.SubmitTelemetry:
        return SubmitTelemetryRequest.deserializePayload(jobId, request)
      case WorkerMessageType.VerifyTransactions:
        return VerifyTransactionsRequest.deserializePayload(jobId, request)
    }
  }

  private parseResponse(
    jobId: number,
    type: WorkerMessageType,
    response: Buffer,
  ): WorkerMessage | JobError | JobAbortedError {
    switch (type) {
      case WorkerMessageType.CreateMinersFee:
        return CreateMinersFeeResponse.deserializePayload(jobId, response)
      case WorkerMessageType.PostTransaction:
        return PostTransactionResponse.deserializePayload(jobId, response)
      case WorkerMessageType.DecryptNotes:
        return DecryptNotesResponse.deserializePayload(jobId, response)
      case WorkerMessageType.JobAborted:
        return JobAbortedMessage.deserializePayload()
      case WorkerMessageType.JobError:
        return JobErrorMessage.deserializePayload(jobId, response)
      case WorkerMessageType.Sleep:
        return SleepResponse.deserializePayload(jobId, response)
      case WorkerMessageType.SubmitTelemetry:
        return SubmitTelemetryResponse.deserializePayload(jobId)
      case WorkerMessageType.VerifyTransactions:
        return VerifyTransactionsResponse.deserializePayload(jobId, response)
    }
  }
}

if (parentPort !== null) {
  new Worker({ parent: parentPort })
}

export function getWorkerPath(): string {
  let workerPath = __dirname

  // Works around different paths when run under ts-jest
  const workerPoolPath = path.join('ironfish', 'src', 'workerPool')
  if (workerPath.includes(workerPoolPath)) {
    workerPath = workerPath.replace(
      workerPoolPath,
      path.join('ironfish', 'build', 'src', 'workerPool'),
    )
  }

  return path.join(workerPath, 'worker.js')
}
