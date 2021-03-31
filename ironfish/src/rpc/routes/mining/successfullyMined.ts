/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { router, ApiNamespace } from '../router'
import * as yup from 'yup'

export type SuccessfullyMinedRequest = { randomness: number; miningRequestId: number }
export type SuccessfullyMinedResponse = Record<string, never> | undefined

export const SuccessfullyMinedRequestSchema: yup.ObjectSchema<SuccessfullyMinedRequest> = yup
  .object({
    randomness: yup.number().defined(),
    miningRequestId: yup.number().defined(),
  })
  .defined()
export const SuccessfullyMinedResponseSchema: yup.MixedSchema<SuccessfullyMinedResponse> = yup
  .mixed()
  .oneOf([undefined] as const)

router.register<typeof SuccessfullyMinedRequestSchema, SuccessfullyMinedResponse>(
  `${ApiNamespace.miner}/successfullyMined`,
  SuccessfullyMinedRequestSchema,
  async (request, node): Promise<void> => {
    if (node.miningDirector) {
      node.miningDirector.successfullyMined(
        request.data.randomness,
        request.data.miningRequestId,
      )
    }
    request.end()
    return Promise.resolve()
  },
)
