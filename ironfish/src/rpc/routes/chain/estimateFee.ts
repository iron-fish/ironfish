/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ValidationError } from '../../adapters/errors'
import { ApiNamespace, router } from '../router'

export type EstimateFeeRequest = {
  fromAccountName: string
  receives: {
    publicAddress: string
    amount: string
    memo: string
  }[]
}
export type EstimateFeeResponse = {
  low: string
  medium: string
  high: string
}

export const EstimateFeeRequestSchema: yup.ObjectSchema<EstimateFeeRequest> = yup
  .object({
    fromAccountName: yup.string().defined(),
    receives: yup
      .array(
        yup
          .object({
            publicAddress: yup.string().defined(),
            amount: yup.string().defined(),
            memo: yup.string().defined(),
          })
          .defined(),
      )
      .defined(),
  })
  .defined()

export const EstimateFeeResponseSchema: yup.ObjectSchema<EstimateFeeResponse> = yup
  .object({
    low: yup.string(),
    medium: yup.string(),
    high: yup.string(),
  })
  .defined()

router.register<typeof EstimateFeeRequestSchema, EstimateFeeResponse>(
  `${ApiNamespace.chain}/estimateFee`,
  EstimateFeeRequestSchema,
  async (request, node): Promise<void> => {
    const account = node.wallet.getAccountByName(request.data.fromAccountName)

    if (!account) {
      throw new ValidationError(`No account found with name ${request.data.fromAccountName}`)
    }

    const receives = request.data.receives.map((receive) => {
      return {
        publicAddress: receive.publicAddress,
        amount: BigInt(receive.amount),
        memo: receive.memo,
      }
    })

    const feeEstimator = node.memPool.feeEstimator

    const low = await feeEstimator.estimateFee('low', account, receives)
    const medium = await feeEstimator.estimateFee('medium', account, receives)
    const high = await feeEstimator.estimateFee('high', account, receives)

    request.end({
      low: low.toString(),
      medium: medium.toString(),
      high: high.toString(),
    })
  },
)
