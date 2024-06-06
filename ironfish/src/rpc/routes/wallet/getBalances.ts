/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { AssetVerification } from '../../../assets'
import { CurrencyUtils } from '../../../utils'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'
import { getAccount } from './utils'

export interface GetBalancesRequest {
  account?: string
  confirmations?: number
}

export interface GetBalancesResponse {
  account: string
  balances: {
    assetId: string
    confirmed: string
    unconfirmed: string
    unconfirmedCount: number
    pending: string
    pendingCount: number
    available: string
    availableNoteCount: number
    blockHash: string | null
    sequence: number | null
    /**
     * @deprecated Please use getAsset endpoint to get this information
     */
    assetName: string
    /**
     * @deprecated Please use getAsset endpoint to get this information
     */
    assetCreator: string
    /**
     * @deprecated Please use getAsset endpoint to get this information
     * */
    assetOwner: string
    /**
     * @deprecated Please use getAsset endpoint to get this information
     * */
    assetVerification: { status: AssetVerification['status'] }
  }[]
}

export const GetBalancesRequestSchema: yup.ObjectSchema<GetBalancesRequest> = yup
  .object({
    account: yup.string().optional(),
    confirmations: yup.number().min(0).optional(),
  })
  .defined()

export const GetBalancesResponseSchema: yup.ObjectSchema<GetBalancesResponse> = yup
  .object({
    account: yup.string().defined(),
    balances: yup
      .array()
      .of(
        yup
          .object()
          .shape({
            assetId: yup.string().defined(),
            assetName: yup.string().defined(),
            assetCreator: yup.string().defined(),
            assetOwner: yup.string().defined(),
            assetVerification: yup
              .object({
                status: yup.string().oneOf(['verified', 'unverified', 'unknown']).defined(),
              })
              .defined(),
            unconfirmed: yup.string().defined(),
            unconfirmedCount: yup.number().defined(),
            pending: yup.string().defined(),
            pendingCount: yup.number().defined(),
            confirmed: yup.string().defined(),
            available: yup.string().defined(),
            availableNoteCount: yup.number().defined(),
            blockHash: yup.string().nullable(true).defined(),
            sequence: yup.number().nullable(true).defined(),
          })
          .defined(),
      )
      .defined(),
  })
  .defined()

routes.register<typeof GetBalancesRequestSchema, GetBalancesResponse>(
  `${ApiNamespace.wallet}/getBalances`,
  GetBalancesRequestSchema,
  async (request, context): Promise<void> => {
    AssertHasRpcContext(request, context, 'wallet', 'assetsVerifier')

    const account = getAccount(context.wallet, request.data.account)

    const balances = []
    for await (const balance of context.wallet.getBalances(
      account,
      request.data.confirmations,
    )) {
      if (request.closed) {
        return
      }

      const asset = await account.getAsset(balance.assetId)

      balances.push({
        assetId: balance.assetId.toString('hex'),
        assetName: asset?.name.toString('hex') ?? '',
        assetCreator: asset?.creator.toString('hex') ?? '',
        assetOwner: asset?.owner.toString('hex') ?? '',
        assetVerification: { status: context.assetsVerifier.verify(balance.assetId).status },
        blockHash: balance.blockHash?.toString('hex') ?? null,
        confirmed: CurrencyUtils.encode(balance.confirmed),
        sequence: balance.sequence,
        unconfirmed: CurrencyUtils.encode(balance.unconfirmed),
        unconfirmedCount: balance.unconfirmedCount,
        pending: CurrencyUtils.encode(balance.pending),
        pendingCount: balance.pendingCount,
        available: CurrencyUtils.encode(balance.available),
        availableNoteCount: balance.availableNoteCount,
      })
    }

    request.end({ account: account.name, balances })
  },
)
