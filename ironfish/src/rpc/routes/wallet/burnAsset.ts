/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { CurrencyUtils, YupUtils } from '../../../utils'
import { RpcAsset, RpcAssetSchema, RpcBurn, RpcBurnSchema } from '../chain/types'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'
import { serializeRpcWalletTransaction } from './serializers'
import { RpcWalletTransaction, RpcWalletTransactionSchema } from './types'
import { getAccount } from './utils'

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
  async (request, context): Promise<void> => {
    AssertHasRpcContext(request, context, 'wallet', 'assetsVerifier', 'config')

    const account = getAccount(context.wallet, request.data.account)

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

    const transaction = await context.wallet.burn(
      account,
      assetId,
      value,
      request.data.expirationDelta ?? context.config.get('transactionExpirationDelta'),
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
        status: await context.wallet.getAssetStatus(account, asset, {
          confirmations: request.data.confirmations,
        }),
        createdTransactionHash: asset.createdTransactionHash.toString('hex'),
        verification: context.assetsVerifier.verify(asset.id),
      },
      transaction: await serializeRpcWalletTransaction(
        context.config,
        context.wallet,
        account,
        transactionValue,
      ),
      id: burn.assetId.toString('hex'),
      assetId: burn.assetId.toString('hex'),
      hash: transaction.hash().toString('hex'),
      name: asset.name.toString('hex'),
      assetName: asset.name.toString('hex'),
      value: CurrencyUtils.encode(burn.value),
    })
  },
)
