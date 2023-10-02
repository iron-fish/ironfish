/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ASSET_METADATA_LENGTH, ASSET_NAME_LENGTH } from '@ironfish/rust-nodejs'
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { CurrencyUtils, YupUtils } from '../../../utils'
import { MintAssetOptions } from '../../../wallet/interfaces/mintAssetOptions'
import { RpcAsset, RpcAssetSchema, RpcMint, RpcMintSchema } from '../../types'
import { ApiNamespace, routes } from '../router'
import { RpcWalletTransaction, RpcWalletTransactionSchema } from './types'
import { getAccount, serializeRpcWalletTransaction } from './utils'

export interface MintAssetRequest {
  account?: string
  fee?: string
  feeRate?: string
  value: string
  assetId?: string
  expiration?: number
  expirationDelta?: number
  confirmations?: number
  metadata?: string
  name?: string
}

export const MintAssetRequestSchema: yup.ObjectSchema<MintAssetRequest> = yup
  .object({
    account: yup.string().required(),
    fee: YupUtils.currency({ min: 1n }).defined(),
    value: YupUtils.currency({ min: 1n }).defined(),
    assetId: yup.string().optional(),
    expiration: yup.number().optional(),
    expirationDelta: yup.number().optional(),
    confirmations: yup.number().optional(),
    metadata: yup.string().optional().max(ASSET_METADATA_LENGTH),
    name: yup.string().optional().max(ASSET_NAME_LENGTH),
  })
  .defined()

export type MintAssetResponse = RpcMint & {
  asset: RpcAsset
  transaction: RpcWalletTransaction
  /**
   * @deprecated Please use `transaction.hash` instead
   */
  hash: string
}

export const MintAssetResponseSchema: yup.ObjectSchema<MintAssetResponse> =
  RpcMintSchema.concat(
    yup
      .object({
        asset: RpcAssetSchema.defined(),
        transaction: RpcWalletTransactionSchema.defined(),
        hash: yup.string().defined(),
      })
      .defined(),
  ).defined()

routes.register<typeof MintAssetRequestSchema, MintAssetResponse>(
  `${ApiNamespace.wallet}/mintAsset`,
  MintAssetRequestSchema,
  async (request, node): Promise<void> => {
    const account = getAccount(node.wallet, request.data.account)

    const fee: bigint | undefined = request.data.fee
      ? CurrencyUtils.decode(request.data.fee)
      : undefined

    const feeRate: bigint | undefined = request.data.feeRate
      ? CurrencyUtils.decode(request.data.feeRate)
      : undefined
    const value = CurrencyUtils.decode(request.data.value)

    const expirationDelta =
      request.data.expirationDelta ?? node.config.get('transactionExpirationDelta')

    let options: MintAssetOptions
    if (request.data.assetId) {
      options = {
        assetId: Buffer.from(request.data.assetId, 'hex'),
        expiration: request.data.expiration,
        fee,
        feeRate,
        expirationDelta,
        value,
        confirmations: request.data.confirmations,
      }
    } else {
      Assert.isNotUndefined(request.data.name, 'Must provide name or identifier to mint')

      const metadata: string = request.data.metadata ?? ''

      options = {
        expiration: request.data.expiration,
        fee,
        feeRate,
        name: request.data.name,
        metadata: metadata,
        expirationDelta,
        value,
        confirmations: request.data.confirmations,
      }
    }

    const transaction = await node.wallet.mint(account, options)
    Assert.isEqual(transaction.mints.length, 1)
    const mint = transaction.mints[0]

    const asset = await account.getAsset(mint.asset.id())
    Assert.isNotUndefined(asset)

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
        verification: node.assetsVerifier.verify(mint.asset.id()),
        status: await node.wallet.getAssetStatus(account, asset, {
          confirmations: request.data.confirmations,
        }),
        createdTransactionHash: asset.createdTransactionHash.toString('hex'),
      },
      transaction: await serializeRpcWalletTransaction(node, account, transactionValue),
      assetId: asset.id.toString('hex'),
      hash: transaction.hash().toString('hex'),
      name: asset.name.toString('hex'),
      value: mint.value.toString(),
      id: mint.asset.id().toString('hex'),
      assetName: mint.asset.name().toString('hex'),
      metadata: mint.asset.metadata().toString('hex'),
      creator: mint.asset.creator().toString('hex'),
      transferOwnershipTo: mint.transferOwnershipTo?.toString('hex'),
    })
  },
)
