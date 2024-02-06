/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { UnsignedTransaction } from '@ironfish/rust-nodejs'
import * as yup from 'yup'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { getAccount } from '../wallet/utils'
import { AssertHasRpcContext } from '..'
import { RPC_ERROR_CODES, RpcResponseError } from '../..'

export type AggregateSigningSharesRequest = {
  account: string
  unsignedTransaction: string
  signingPackage: string
  signingShares: Array<{
    identifier: string
    signingShare: string
  }>
}

export type AggregateSigningSharesResponse = {
  transaction: string
}

export const AggregateSigningSharesRequestSchema: yup.ObjectSchema<AggregateSigningSharesRequest> =
  yup
    .object({
      account: yup.string().defined(),
      unsignedTransaction: yup.string().defined(),
      signingPackage: yup.string().defined(),
      signingShares: yup
        .array(
          yup
            .object({
              identifier: yup.string().defined(),
              signingShare: yup.string().defined(),
            })
            .defined(),
        )
        .defined(),
    })
    .defined()

export const AggregateSigningSharesResponseSchema: yup.ObjectSchema<AggregateSigningSharesResponse> =
  yup
    .object({
      transaction: yup.string().defined(),
    })
    .defined()

routes.register<typeof AggregateSigningSharesRequestSchema, AggregateSigningSharesResponse>(
  `${ApiNamespace.multisig}/aggregateSigningShares`,
  AggregateSigningSharesRequestSchema,
  (request, node): void => {
    AssertHasRpcContext(request, node, 'wallet')

    const account = getAccount(node.wallet, request.data.account)
    if (account.multiSigKeys === undefined) {
      throw new RpcResponseError(
        `Account ${account} does not have any multisig fields to aggregate signing shares`,
        RPC_ERROR_CODES.ERROR,
      )
    }

    const unsigned = new UnsignedTransaction(
      Buffer.from(request.data.unsignedTransaction, 'hex'),
    )

    // TODO(hughy): change interface of signFrost to take Array of shares instead of Record
    const signingShares: Record<string, string> = {}
    for (const { identifier, signingShare } of request.data.signingShares) {
      signingShares[identifier] = signingShare
    }

    const transaction = unsigned.signFrost(
      account.multiSigKeys.publicKeyPackage,
      request.data.signingPackage,
      signingShares,
    )

    request.end({
      transaction: transaction.toString('hex'),
    })
  },
)
