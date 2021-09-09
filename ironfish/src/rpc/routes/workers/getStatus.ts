/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { WorkerPool } from '../../../workerPool'
import { ApiNamespace, router } from '../router'

export type GetWorkersStatusRequest =
  | undefined
  | {
      stream?: boolean
    }

export type GetWorkersStatusResponse = {
  started: boolean
  jobs: Array<{
    name: string
    complete: number
    execute: number
    queue: number
    error: number
  }>
}

export const GetWorkersStatusRequestSchema: yup.ObjectSchema<GetWorkersStatusRequest> = yup
  .object({
    stream: yup.boolean().optional(),
  })
  .optional()
  .default({})

export const GetWorkersStatusResponseSchema: yup.ObjectSchema<GetWorkersStatusResponse> = yup
  .object({
    started: yup.boolean().defined(),
    jobs: yup
      .array(
        yup
          .object({
            name: yup.string().defined(),
            complete: yup.number().defined(),
            execute: yup.number().defined(),
            queue: yup.number().defined(),
            error: yup.number().defined(),
          })
          .defined(),
      )
      .defined(),
  })
  .defined()

router.register<typeof GetWorkersStatusRequestSchema, GetWorkersStatusResponse>(
  `${ApiNamespace.worker}/getStatus`,
  GetWorkersStatusRequestSchema,
  (request, node): void => {
    const jobs = getJobs(node.workerPool)

    if (!request.data?.stream) {
      request.end({ started: node.workerPool.started, jobs })
      return
    }

    request.stream({ started: node.workerPool.started, jobs })

    const interval = setInterval(() => {
      const jobs = getJobs(node.workerPool)
      request.stream({ started: node.workerPool.started, jobs })
    }, 1000)

    request.onClose.on(() => {
      clearInterval(interval)
    })
  },
)

function getJobs(pool: WorkerPool): GetWorkersStatusResponse['jobs'] {
  const result: GetWorkersStatusResponse['jobs'] = []

  for (const name of pool.stats.keys()) {
    // Move control messages to top level message and not request body type
    if (name === 'jobAbort' || name === 'sleep') {
      continue
    }

    const job = pool.stats.get(name)

    if (job) {
      result.push({ name: name, ...job })
    }
  }

  return result
}
