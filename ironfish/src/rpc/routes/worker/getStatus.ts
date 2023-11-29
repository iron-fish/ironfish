/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { MathUtils } from '../../../utils'
import { WorkerPool } from '../../../workerPool'
import { WorkerMessageType } from '../../../workerPool/tasks/workerMessage'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'

export type GetWorkersStatusRequest =
  | undefined
  | {
      stream?: boolean
    }

export type GetWorkersStatusResponse = {
  started: boolean
  workers: number
  queued: number
  capacity: number
  executing: number
  change: number
  speed: number
  jobs: {
    name: string
    complete: number
    execute: number
    queue: number
    error: number
  }[]
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
    workers: yup.number().defined(),
    queued: yup.number().defined(),
    capacity: yup.number().defined(),
    executing: yup.number().defined(),
    change: yup.number().defined(),
    speed: yup.number().defined(),
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

routes.register<typeof GetWorkersStatusRequestSchema, GetWorkersStatusResponse>(
  `${ApiNamespace.worker}/getStatus`,
  GetWorkersStatusRequestSchema,
  (request, context): void => {
    AssertHasRpcContext(request, context, 'workerPool')

    const jobs = getWorkersStatus(context.workerPool)

    if (!request.data?.stream) {
      request.end(jobs)
      return
    }

    request.stream(jobs)

    const interval = setInterval(() => {
      const jobs = getWorkersStatus(context.workerPool)
      request.stream(jobs)
    }, 1000)

    request.onClose.on(() => {
      clearInterval(interval)
    })
  },
)

function getWorkersStatus(workerPool: WorkerPool): GetWorkersStatusResponse {
  const result: GetWorkersStatusResponse['jobs'] = []

  for (const type of workerPool.stats.keys()) {
    if (type === WorkerMessageType.JobAborted || type === WorkerMessageType.Sleep) {
      continue
    }

    const job = workerPool.stats.get(type)

    if (job) {
      result.push({ name: WorkerMessageType[type], ...job })
    }
  }
  return {
    started: workerPool.started,
    workers: workerPool.workers.length,
    executing: workerPool.executing,
    queued: workerPool.queued,
    capacity: workerPool.capacity,
    change: MathUtils.round(workerPool.change?.rate5s ?? 0, 2),
    speed: MathUtils.round(workerPool.speed?.rate5s ?? 0, 2),
    jobs: result,
  }
}
