/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { WorkerRequestMessage, WorkerResponseMessage } from './messages'
import { generateKey } from '@ironfish/rust-nodejs'
import bufio from 'bufio'
import path from 'path'
import { MessagePort, parentPort, Worker as WorkerThread } from 'worker_threads'
import { Assert } from '../assert'
import { createRootLogger, Logger } from '../logger'
import { Job } from './job'
import { CreateMinersFeeRequest, CreateMinersFeeResponse } from './tasks'
import { JobError, SerializableJobError } from './tasks/jobError'
import { SleepRequest, SleepResponse } from './tasks/sleep'
import { SubmitTelemetryRequest, SubmitTelemetryResponse } from './tasks/submitTelemetry'
import { VerifyTransactionRequest, VerifyTransactionResponse } from './tasks/verifyTransaction'
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

  execute(job: Job): void {
    this.jobs.set(job.id, job)
    job.execute(this)
  }

  send(message: WorkerRequestMessage | WorkerResponseMessage | WorkerMessage): void {
    if (this.thread) {
      if ('body' in message) {
        this.thread.postMessage(message)
      } else {
        this.thread.postMessage(message.serializeWithMetadata())
      }
    } else if (this.parent) {
      if ('body' in message) {
        this.parent.postMessage(message)
      } else {
        this.parent.postMessage(message.serializeWithMetadata())
      }
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
    generateKey()
  }

  private onMessageFromParent = (request: WorkerRequestMessage | Uint8Array): void => {
    if ('body' in request) {
      const job = this.jobs.get(request.jobId)

      if (job) {
        this.jobs.delete(job.id)
        job?.abort()
      }
      return
    }

    let job: Job
    if (!('body' in request)) {
      const message = Buffer.from(request)
      const { jobId, type, body } = this.parseHeader(message)
      const requestBody = this.parseRequest(jobId, type, body)
      job = new Job(requestBody)
    } else {
      job = new Job(request)
    }

    this.jobs.set(job.id, job)

    job
      .execute()
      .response()
      .then((response: WorkerResponseMessage | WorkerMessage) => {
        this.send(response)
      })
      .catch((e: unknown) => {
        this.send(new SerializableJobError(job.id, e))
      })
      .finally(() => {
        this.jobs.delete(job.id)
      })
  }

  private onMessageFromWorker = (response: WorkerResponseMessage | Uint8Array): void => {
    let jobId
    let type: WorkerMessageType | undefined
    let body: Buffer | undefined
    if ('jobId' in response) {
      jobId = response.jobId
    } else {
      const buffer = Buffer.from(response)
      const header = this.parseHeader(buffer)
      jobId = header.jobId
      type = header.type
      body = header.body
    }

    const job = this.jobs.get(jobId)
    this.jobs.delete(jobId)

    if (!job) {
      return
    }

    Assert.isNotNull(job.resolve)
    Assert.isNotNull(job.reject)

    if (response instanceof Uint8Array) {
      Assert.isNotUndefined(type)
      Assert.isNotUndefined(body)
      const prevStatus = job.status
      job.status = 'success'
      job.onChange.emit(job, prevStatus)
      job.onEnded.emit(job)
      const result = this.parseResponse(jobId, type, body)
      if (result instanceof JobError) {
        job.status = 'error'
        job.reject(result)
        return
      }

      job.resolve(result)
      return
    }

    const prevStatus = job.status
    job.status = 'success'
    job.onChange.emit(job, prevStatus)
    job.onEnded.emit(job)
    job.resolve(response)
  }

  private parseHeader(data: Buffer): {
    jobId: number
    type: WorkerMessageType
    body: Buffer
  } {
    const br = bufio.read(data)
    const jobId = Number(br.readU64())
    const type = br.readU8()
    const size = br.readU64()
    return {
      jobId,
      type,
      body: br.readBytes(size),
    }
  }

  private parseRequest(jobId: number, type: WorkerMessageType, request: Buffer): WorkerMessage {
    switch (type) {
      case WorkerMessageType.CreateMinersFee:
        return CreateMinersFeeRequest.deserialize(jobId, request)
      case WorkerMessageType.JobError:
        throw new Error('JobError should not be sent as a request')
      case WorkerMessageType.Sleep:
        return SleepRequest.deserialize(jobId, request)
      case WorkerMessageType.SubmitTelemetry:
        return SubmitTelemetryRequest.deserialize(jobId, request)
      case WorkerMessageType.VerifyTransaction:
        return VerifyTransactionRequest.deserialize(jobId, request)
    }
  }

  private parseResponse(
    jobId: number,
    type: WorkerMessageType,
    response: Buffer,
  ): WorkerMessage | JobError {
    switch (type) {
      case WorkerMessageType.CreateMinersFee:
        return CreateMinersFeeResponse.deserialize(jobId, response)
      case WorkerMessageType.JobError:
        return SerializableJobError.deserialize(jobId, response)
      case WorkerMessageType.Sleep:
        return SleepResponse.deserialize(jobId, response)
      case WorkerMessageType.SubmitTelemetry:
        return SubmitTelemetryResponse.deserialize(jobId)
      case WorkerMessageType.VerifyTransaction:
        return VerifyTransactionResponse.deserialize(jobId, response)
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
