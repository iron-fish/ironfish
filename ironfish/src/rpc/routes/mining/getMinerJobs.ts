/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import * as yup from 'yup'
import { Miner } from '../../..'
import { MinerJob } from '../../../mining/minerDirector'
import { ValidationError } from '../../adapters'
import { ApiNamespace, router } from '../router'

export type GetMinerJobsRequest = {
  id: number
  token: string
}

export type GetMinerJobsResponse = {
  target: string
  jobId: number
  random: string
  randomMax: string
  bytes: string
  flush: boolean
}

export const GetMinerJobsRequestSchema: yup.ObjectSchema<GetMinerJobsRequest> = yup
  .object({
    id: yup.number().defined(),
    token: yup.string().defined(),
  })
  .defined()

export const GetMinerJobsResponseSchema: yup.ObjectSchema<GetMinerJobsResponse> = yup
  .object({
    target: yup.string().defined(),
    random: yup.string().defined(),
    randomMax: yup.string().defined(),
    jobId: yup.number().defined(),
    bytes: yup.string().defined(),
    flush: yup.boolean().defined(),
  })
  .defined()

router.register<typeof GetMinerJobsRequestSchema, GetMinerJobsResponse>(
  `${ApiNamespace.miner}/getMinerJobs`,
  GetMinerJobsRequestSchema,
  (request, node): void => {
    const miner = node.miningDirector.getMiner(request.data.id, request.data.token)

    if (!miner) {
      throw new ValidationError('Invalid token call connectMinerStream() first')
    }

    const onJob = (job: MinerJob) => {
      node.logger.debug(
        `Sending miner job to ${miner.name}:\n${JSON.stringify(job, undefined, '  ')}`,
      )

      request.stream({
        jobId: job.id,
        target: job.target,
        random: job.random,
        randomMax: job.randomMax,
        bytes: job.bytes,
        flush: job.flush,
      })
    }

    miner.onJob.on(onJob)

    request.onClose.once(() => {
      miner.onJob.off(onJob)
    })
  },
)
