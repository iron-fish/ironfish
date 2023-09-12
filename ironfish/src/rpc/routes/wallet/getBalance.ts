/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import * as yup from 'yup'
import { AssetVerification } from '../../../assets'
import { RpcAssetSchema } from '../../types'
import { ApiNamespace, routes } from '../router'
import { getAccount } from './utils'

export type GetBalanceRequest =
  | {
      account?: string
      assetId?: string
      confirmations?: number
    }
  | undefined

export type GetBalanceResponse = {
  account: string
  assetId: string
  /**
   * @deprecated Please use getAsset endpoint to get this information
   * */
  assetVerification: AssetVerification
  confirmed: string
  unconfirmed: string
  unconfirmedCount: number
  pending: string
  pendingCount: number
  available: string
  confirmations: number
  blockHash: string | null
  sequence: number | null
}

export const GetBalanceRequestSchema: yup.ObjectSchema<GetBalanceRequest> = yup
  .object({
    account: yup.string().optional().trim(),
    assetId: yup.string().optional().trim(),
    confirmations: yup.number().min(0).optional(),
  })
  .optional()

export const GetBalanceResponseSchema: yup.ObjectSchema<GetBalanceResponse> = yup
  .object({
    account: yup.string().defined(),
    assetId: yup.string().defined(),
    asset: RpcAssetSchema.optional(),
    assetVerification: yup
      .object({ status: yup.string().oneOf(['verified', 'unverified', 'unknown']).defined() })
      .defined(),
    unconfirmed: yup.string().defined(),
    unconfirmedCount: yup.number().defined(),
    pending: yup.string().defined(),
    pendingCount: yup.number().defined(),
    confirmed: yup.string().defined(),
    available: yup.string().defined(),
    confirmations: yup.number().defined(),
    blockHash: yup.string().nullable(true).defined(),
    sequence: yup.number().nullable(true).defined(),
  })
  .defined()

routes.register<typeof GetBalanceRequestSchema, GetBalanceResponse>(
  `${ApiNamespace.wallet}/getBalance`,
  GetBalanceRequestSchema,
  async (request, node): Promise<void> => {
    const confirmations = request.data?.confirmations ?? node.config.get('confirmations')

    const account = getAccount(node.wallet, request.data?.account)

    let assetId = Asset.nativeId()
    if (request.data?.assetId) {
      assetId = Buffer.from(request.data.assetId, 'hex')
    }

    const balance = await node.wallet.getBalance(account, assetId, {
      confirmations,
    })

    const asset = await account.getAsset(assetId)

    request.end({
      account: account.name,
      assetId: assetId.toString('hex'),
      assetVerification: node.assetsVerifier.verify(assetId),
      confirmed: balance.confirmed.toString(),
      unconfirmed: balance.unconfirmed.toString(),
      unconfirmedCount: balance.unconfirmedCount,
      pending: balance.pending.toString(),
      available: balance.available.toString(),
      pendingCount: balance.pendingCount,
      confirmations: confirmations,
      blockHash: balance.blockHash?.toString('hex') ?? null,
      sequence: balance.sequence,
    })
  },
)
