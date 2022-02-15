/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Event } from '../event'
import { PromiseReject, PromiseResolve, PromiseUtils } from '../utils'
import { JobAbortedError } from './errors'
import {
  AllWorkerRequestMessages,
  AllWorkerResponseMessages,
  WorkerRequestMessageSerialized,
  WorkerResponseMessageSerialized,
} from './messages'
import { handleRequest } from './tasks'
import { Worker } from './worker'

export class Job {
  id: number
  request: AllWorkerRequestMessages
  worker: Worker | null
  status: 'init' | 'queued' | 'executing' | 'success' | 'error' | 'aborted'
  promise: Promise<AllWorkerResponseMessages>
  resolve: PromiseResolve<AllWorkerResponseMessages>
  reject: PromiseReject

  onEnded = new Event<[Job]>()
  onChange = new Event<[Job, Job['status']]>()

  // This determines if JobAbortedError is fed into the response if the job is
  // aborted. The code base hasn't been upgraded to handle these so it should be
  // enabled for each job that now properly handles it until all jobs handle it.
  // Then this should be removed.
  enableJobAbortError = false

  constructor(request: AllWorkerRequestMessages) {
    this.id = request.jobId
    this.request = request
    this.worker = null
    this.status = 'queued'

    const [promise, resolve, reject] = PromiseUtils.split<AllWorkerResponseMessages>()
    this.promise = promise
    this.resolve = resolve
    this.reject = reject

    this.promise.catch(() => {
      // Eat the exception. You can still catch
      // the exception using job.response()
    })
  }

  abort(): void {
    if (this.status !== 'queued' && this.status !== 'executing') {
      return
    }

    const prevStatus = this.status
    this.status = 'aborted'
    this.onChange.emit(this, prevStatus)
    this.onEnded.emit(this)

    if (this.worker) {
      this.worker.send({ jobId: this.id, body: { type: 'jobAbort' } })
      this.worker.jobs.delete(this.id)
    }

    if (this.reject && this.enableJobAbortError) {
      this.reject(new JobAbortedError())
    }
  }

  execute(worker: Worker | null = null): Job {
    const prevStatus = this.status
    this.status = 'executing'
    this.worker = worker
    this.onChange.emit(this, prevStatus)

    if (worker) {
      worker.send(this.request)
      return this
    }

    void handleRequest(this.request, this)
      .then((r) => {
        if (this.status !== 'aborted') {
          const prevStatus = this.status
          this.status = 'success'
          this.onChange.emit(this, prevStatus)
          this.onEnded.emit(this)
          this.resolve?.(r)
        }
      })
      .catch((e: unknown) => {
        if (this.status !== 'aborted') {
          const prevStatus = this.status
          this.status = 'error'
          this.onChange.emit(this, prevStatus)
          this.onEnded.emit(this)
          this.reject?.(e)
        }
      })

    return this
  }

  async response(): Promise<AllWorkerResponseMessages> {
    const response = await this.promise

    const responseType =
      'type' in response.body
        ? response.body.type
        : (response as WorkerResponseMessageSerialized).type

    const requestType =
      'type' in this.request.body
        ? this.request.body.type
        : (this.request as WorkerRequestMessageSerialized).type.type

    if (response === null || responseType !== requestType) {
      throw new Error(
        `Response type must match request type ${requestType} but was ${String(
          response,
        )} with job status ${this.status}`,
      )
    }

    return response
  }

  async result(): Promise<AllWorkerResponseMessages> {
    const response = await this.response()
    return response
  }
}
