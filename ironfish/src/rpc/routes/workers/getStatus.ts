/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { IronfishNode } from '../../../node'
import { MathUtils } from '../../../utils'
import { ApiNamespace, router } from '../router'

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

router.register<typeof GetWorkersStatusRequestSchema, GetWorkersStatusResponse>(
  `${ApiNamespace.worker}/getStatus`,
  GetWorkersStatusRequestSchema,
  (request, node): void => {
    const jobs = getWorkersStatus(node)

    if (!request.data?.stream) {
      request.end(jobs)
      return
    }

    request.stream(jobs)

    const interval = setInterval(() => {
      const jobs = getWorkersStatus(node)
      request.stream(jobs)
    }, 1000)

    request.onClose.on(() => {
      clearInterval(interval)
    })
  },
)

function getWorkersStatus(node: IronfishNode): GetWorkersStatusResponse {
  const result: GetWorkersStatusResponse['jobs'] = []

  for (const name of node.workerPool.stats.keys()) {
    // Move control messages to top level message and not request body type
    if (name === 'jobAbort' || name === 'sleep') {
      continue
    }

    const job = node.workerPool.stats.get(name)

    if (job) {
      result.push({ name: name, ...job })
    }
  }
  return {
    started: node.workerPool.started,
    workers: node.workerPool.workers.length,
    executing: node.workerPool.executing,
    queued: node.workerPool.queued,
    capacity: node.workerPool.capacity,
    change: MathUtils.round(node.workerPool.change?.rate5s ?? 0, 2),
    speed: MathUtils.round(node.workerPool.speed?.rate5s ?? 0, 2),
    jobs: result,
  }
}
