/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { CurrencyUtils, YupUtils } from '../../../utils'
import { RpcAsset, RpcAssetSchema, RpcBurn, RpcBurnSchema } from '../../types'
import { ApiNamespace, routes } from '../router'
import { RpcWalletTransaction, RpcWalletTransactionSchema } from './types'
import { getAccount, serializeRpcWalletTransaction } from './utils'

export interface BurnAssetRequest {
  account?: string
  assetId: string
  fee?: string
  feeRate?: string
  value: string
  expiration?: number
  expirationDelta?: number
  confirmations?: number
}

export const BurnAssetRequestSchema: yup.ObjectSchema<BurnAssetRequest> = yup
  .object({
    account: yup.string().required(),
    assetId: yup.string().required(),
    fee: YupUtils.currency({ min: 1n }).defined(),
    value: YupUtils.currency({ min: 1n }).defined(),
    expiration: yup.number().optional(),
    expirationDelta: yup.number().optional(),
    confirmations: yup.number().optional(),
  })
  .defined()

export type BurnAssetResponse = RpcBurn & {
  asset: RpcAsset
  transaction: RpcWalletTransaction
  /**
   * @deprecated Please use `transaction.hash` instead
   */
  hash: string
  /**
   * @deprecated Please use `asset.name` instead
   */
  name: string
}

export const BurnAssetResponseSchema: yup.ObjectSchema<BurnAssetResponse> =
  RpcBurnSchema.concat(
    yup
      .object({
        asset: RpcAssetSchema.defined(),
        transaction: RpcWalletTransactionSchema.defined(),
        name: yup.string().defined(),
        hash: yup.string().defined(),
      })
      .defined(),
  ).defined()

routes.register<typeof BurnAssetRequestSchema, BurnAssetResponse>(
  `${ApiNamespace.wallet}/burnAsset`,
  BurnAssetRequestSchema,
  async (request, node): Promise<void> => {
    const account = getAccount(node.wallet, request.data.account)

    const fee: bigint | undefined = request.data.fee
      ? CurrencyUtils.decode(request.data.fee)
      : undefined

    const value = CurrencyUtils.decode(request.data.value)

    const feeRate: bigint | undefined = request.data.feeRate
      ? CurrencyUtils.decode(request.data.feeRate)
      : undefined

    const assetId = Buffer.from(request.data.assetId, 'hex')
    const asset = await account.getAsset(assetId)
    Assert.isNotUndefined(asset)

    const transaction = await node.wallet.burn(
      account,
      assetId,
      value,
      request.data.expirationDelta ?? node.config.get('transactionExpirationDelta'),
      fee,
      feeRate,
      request.data.expiration,
      request.data.confirmations,
    )
    Assert.isEqual(transaction.burns.length, 1)
    const burn = transaction.burns[0]

    const transactionValue = await account.getTransaction(transaction.hash())
    Assert.isNotUndefined(transactionValue)

    request.end({
      asset: {
        id: asset.id.toString('hex'),
        metadata: asset.metadata.toString('hex'),
        name: asset.name.toString('hex'),
        nonce: asset.nonce,
        creator: asset.creator.toString('hex'),
        owner: asset.owner.toString('hex'),
        verification: node.assetsVerifier.verify(asset.id),
        status: await node.wallet.getAssetStatus(account, asset, {
          confirmations: request.data.confirmations,
        }),
        createdTransactionHash: asset.createdTransactionHash.toString('hex'),
      },
      transaction: await serializeRpcWalletTransaction(node, account, transactionValue),
      id: burn.assetId.toString('hex'),
      assetId: burn.assetId.toString('hex'),
      hash: transaction.hash().toString('hex'),
      name: asset.name.toString('hex'),
      assetName: asset.name.toString('hex'),
      value: CurrencyUtils.encode(burn.value),
    })
  },
)
