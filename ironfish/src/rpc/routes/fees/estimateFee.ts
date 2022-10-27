/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { PRIORITY_LEVELS, PriorityLevel } from '../../../memPool/feeEstimator'
import { ValidationError } from '../../adapters/errors'
import { ApiNamespace, router } from '../router'

export type EstimateFeeRequest = {
  priority?: PriorityLevel
  fromAccountName: string
  receives: {
    publicAddress: string
    amount: string
    memo: string
  }[]
}
export type EstimateFeeResponse = {
  fee: string
}

export const EstimateFeeRequestSchema: yup.ObjectSchema<EstimateFeeRequest> = yup
  .object({
    priority: yup.string().oneOf(PRIORITY_LEVELS),
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
    fee: yup.string(),
  })
  .defined()

router.register<typeof EstimateFeeRequestSchema, EstimateFeeResponse>(
  `${ApiNamespace.fees}/estimateFee`,
  EstimateFeeRequestSchema,
  async (request, node): Promise<void> => {
    const account = node.wallet.getAccountByName(request.data.fromAccountName)

    if (!account) {
      throw new ValidationError(`No account found with name ${request.data.fromAccountName}`)
    }

    const priority = request.data.priority || 'medium'

    const receives = request.data.receives.map((receive) => {
      return {
        publicAddress: receive.publicAddress,
        amount: BigInt(receive.amount),
        memo: receive.memo,
      }
    })

    const feeEstimator = node.memPool.feeEstimator

    const fee = await feeEstimator.estimateFee(priority, account, receives)

    request.end({
      fee: fee.toString(),
    })
  },
)
