/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Job } from '../job'
import { WorkerMessage } from './workerMessage'
import { handlers } from './handlers'
import { WorkerRequestMessage, WorkerResponse, WorkerResponseMessage } from '../messages'

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

  const body = request.body

  response = { type: 'type' }

  return { jobId: request.jobId, body: response }
}
