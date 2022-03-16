/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Request and response message types used for communication
 * between the worker pool and workers.
 */

export type WorkerRequestMessage = {
  jobId: number
  body: WorkerRequest
}

export type WorkerResponseMessage = {
  jobId: number
  body: WorkerResponse
}

export type WorkerRequest = {
  type: 'type'
}

export type WorkerResponse = {
  type: 'type'
}
