/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { WorkerMessageType, WorkerRequestMessage, WorkerResponseMessage } from './messages'
import { generateKey } from 'ironfish-rust-nodejs'
import path from 'path'
import { MessagePort, parentPort, Worker as WorkerThread } from 'worker_threads'
import { Assert } from '../assert'
import { createRootLogger, Logger } from '../logger'
import { JobError } from './errors'
import { Job } from './job'
import { JobErrorResp } from './tasks/jobAbort'

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

  send(message: WorkerRequestMessage | WorkerResponseMessage): void {
    if (this.thread) {
      this.thread.postMessage(message)
    } else if (this.parent) {
      this.parent.postMessage(message)
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

  private onMessageFromParent = (request: WorkerRequestMessage): void => {
    if (request.type === WorkerMessageType.jobAbort) {
      const job = this.jobs.get(request.jobId)

      if (job) {
        this.jobs.delete(job.id)
        job?.abort()
      }
      return
    }

    const job = new Job(request)
    this.jobs.set(job.id, job)

    job
      .execute()
      .response()
      .then((response: WorkerResponseMessage) => {
        this.send(response)
      })
      .catch((e: unknown) => {
        this.send({
          jobId: job.id,
          type: WorkerMessageType.jobError,
          body: JobErrorResp.serialize({
            type: WorkerMessageType.jobError,
            error: new JobError(e).serialize(),
          }),
        })
      })
      .finally(() => {
        this.jobs.delete(job.id)
      })
  }

  private onMessageFromWorker = (response: WorkerResponseMessage): void => {
    const job = this.jobs.get(response.jobId)
    this.jobs.delete(response.jobId)

    if (!job) {
      return
    }

    Assert.isNotNull(job.resolve)
    Assert.isNotNull(job.reject)

    if (response.type === WorkerMessageType.jobError) {
      const prevStatus = job.status
      const jobErrorResponse = new JobErrorResp(response.body).deserialize()
      job.status = 'error'
      job.onChange.emit(job, prevStatus)
      job.onEnded.emit(job)
      job.reject(JobError.deserialize(jobErrorResponse.error))
    } else {
      const prevStatus = job.status
      job.status = 'success'
      job.onChange.emit(job, prevStatus)
      job.onEnded.emit(job)
      job.resolve(response)
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
