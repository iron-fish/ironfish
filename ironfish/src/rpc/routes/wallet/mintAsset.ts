/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { CurrencyUtils } from '../../../utils'
import { ValidationError } from '../../adapters'
import { ApiNamespace, router } from '../router'

export interface MintAssetRequest {
  account: string
  fee: string
  metadata: string
  name: string
  value: string
  expiration?: number
  expirationDelta?: number
}

export interface MintAssetResponse {
  assetIdentifier: string
  hash: string
}

export const MintAssetRequestSchema: yup.ObjectSchema<MintAssetRequest> = yup
  .object({
    account: yup.string().required(),
    fee: yup.string().required(),
    metadata: yup.string().required(),
    name: yup.string().required(),
    value: yup.string().required(),
    expiration: yup.number().optional(),
    expirationDelta: yup.number().optional(),
  })
  .defined()

export const MintAssetResponseSchema: yup.ObjectSchema<MintAssetResponse> = yup
  .object({
    assetIdentifier: yup.string().required(),
    hash: yup.string().required(),
  })
  .defined()

router.register<typeof MintAssetRequestSchema, MintAssetResponse>(
  `${ApiNamespace.wallet}/mintAsset`,
  MintAssetRequestSchema,
  async (request, node): Promise<void> => {
    const account = node.wallet.getAccountByName(request.data.account)
    if (!account) {
      throw new ValidationError(`No account found with name ${request.data.account}`)
    }

    const fee = CurrencyUtils.decode(request.data.fee)
    if (fee < 1n) {
      throw new ValidationError(`Invalid transaction fee, ${fee}`)
    }

    const value = CurrencyUtils.decodeIron(request.data.value)
    if (value <= 0) {
      throw new ValidationError('Invalid mint amount')
    }

    const transaction = await node.wallet.mint(
      node.memPool,
      account,
      request.data.name,
      request.data.metadata,
      value,
      fee,
      request.data.expirationDelta ?? node.config.get('transactionExpirationDelta'),
      request.data.expiration,
    )
    Assert.isEqual(transaction.mints.length, 1)
    const mint = transaction.mints[0]

    request.end({
      assetIdentifier: mint.asset.identifier().toString('hex'),
      hash: transaction.hash().toString('hex'),
    })
  },
)
