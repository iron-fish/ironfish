/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import * as yup from 'yup'
import { ValidationError } from '../../adapters'
import { ApiNamespace, router } from '../router'

export type GetMinerWorkRequest = {
  id: number
  token: string
}

export type GetMinerWorkResponse = undefined

export const GetMinerWorkRequestSchema: yup.ObjectSchema<GetMinerWorkRequest> = yup
  .object({
    id: yup.number().defined(),
    token: yup.string().defined(),
  })
  .defined()

export const GetMinerWorkResponseSchema: yup.MixedSchema<GetMinerWorkResponse> = yup
  .mixed()
  .oneOf([undefined] as const)

router.register<typeof GetMinerWorkRequestSchema, GetMinerWorkResponse>(
  `${ApiNamespace.miner}/getMinerWork`,
  GetMinerWorkRequestSchema,
  (request, node): void => {
    const miner = node.miningDirector.getMiner(request.data.id, request.data.token)

    if (!miner) {
      throw new ValidationError('Invalid token call connectMinerStream() first')
    }

    node.miningDirector.requestWork(miner)

    request.end()
  },
)
