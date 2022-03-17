/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Job } from '../job'
import { WorkerRequestMessage, WorkerResponse, WorkerResponseMessage } from '../messages'
import { handlers } from './handlers'
import { WorkerMessage } from './workerMessage'

export async function handleRequest(
  request: WorkerRequestMessage | WorkerMessage,
  job: Job,
): Promise<WorkerResponseMessage | WorkerMessage> {
  let response: WorkerResponse | WorkerMessage | null = null

  if (!('body' in request)) {
    const handler = handlers[request.type]
    if (!handler) {
      throw new Error()
    }
    return handler.execute(request, job)
  }

  response = { type: 'type' }

  return { jobId: request.jobId, body: response }
}
