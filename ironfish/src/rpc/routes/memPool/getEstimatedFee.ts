/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ApiNamespace, router } from '../router'

export type GetEstimatedFeeRequest = {}
export type GetEstimatedFeeResponse = { fee: string;}

export const GetEstimatedFeeRequestSchema: yup.ObjectSchema<GetEstimatedFeeRequest> = yup
  .object({})
  .defined()

export const GetEstimatedFeeResponseSchema: yup.ObjectSchema<GetEstimatedFeeResponse> = yup
  .object({
    fee: yup.string().defined(),
  })
  .defined()

router.register<typeof GetEstimatedFeeRequestSchema, GetEstimatedFeeResponse>(
  `${ApiNamespace.memPool}/getEstimatedFee`,
  GetEstimatedFeeRequestSchema,
  async (request, node): Promise<void> => {
    const fee = node.memPool.getEstimatedFee()

    request.end({
      fee: fee.toString(),
    })
  },
)
