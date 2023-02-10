/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { CurrencyUtils } from '../../../utils'
import { ValidationError } from '../../adapters'
import { ApiNamespace, router } from '../router'

export interface BurnAssetRequest {
  account: string
  assetId: string
  fee: string
  value: string
  expiration?: number
  expirationDelta?: number
  confirmations?: number
}

export interface BurnAssetResponse {
  assetId: string
  hash: string
  value: string
}

export const BurnAssetRequestSchema: yup.ObjectSchema<BurnAssetRequest> = yup
  .object({
    account: yup.string().required(),
    assetId: yup.string().required(),
    fee: yup.string().required(),
    value: yup.string().required(),
    expiration: yup.number().optional(),
    expirationDelta: yup.number().optional(),
    confirmations: yup.number().optional(),
  })
  .defined()

export const BurnAssetResponseSchema: yup.ObjectSchema<BurnAssetResponse> = yup
  .object({
    assetId: yup.string().required(),
    hash: yup.string().required(),
    value: yup.string().required(),
  })
  .defined()

router.register<typeof BurnAssetRequestSchema, BurnAssetResponse>(
  `${ApiNamespace.wallet}/burnAsset`,
  BurnAssetRequestSchema,
  async (request, node): Promise<void> => {
    const account = node.wallet.getAccountByName(request.data.account)
    if (!account) {
      throw new ValidationError(`No account found with name ${request.data.account}`)
    }

    const fee = CurrencyUtils.decode(request.data.fee)
    if (fee < 1n) {
      throw new ValidationError(`Invalid transaction fee, ${fee}`)
    }

    const value = CurrencyUtils.decode(request.data.value)
    if (value <= 0) {
      throw new ValidationError('Invalid burn amount')
    }

    const transaction = await node.wallet.burn(
      node.memPool,
      account,
      Buffer.from(request.data.assetId, 'hex'),
      value,
      fee,
      request.data.expirationDelta ?? node.config.get('transactionExpirationDelta'),
      request.data.expiration,
      request.data.confirmations,
    )
    Assert.isEqual(transaction.burns.length, 1)
    const burn = transaction.burns[0]

    request.end({
      assetId: burn.assetId.toString('hex'),
      hash: transaction.hash().toString('hex'),
      value: CurrencyUtils.encode(burn.value),
    })
  },
)
