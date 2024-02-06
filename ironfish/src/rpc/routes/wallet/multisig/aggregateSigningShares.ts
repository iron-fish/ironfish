/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { UnsignedTransaction } from '@ironfish/rust-nodejs'
import * as yup from 'yup'
import { Assert } from '../../../../assert'
import { ApiNamespace } from '../../namespaces'
import { routes } from '../../router'
import { AssertHasRpcContext } from '../../rpcContext'
import { getAccount } from '../utils'

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
  `${ApiNamespace.wallet}/multisig/aggregateSigningShares`,
  AggregateSigningSharesRequestSchema,
  (request, node): void => {
    AssertHasRpcContext(request, node, 'wallet')
    const account = getAccount(node.wallet, request.data.account)
    // TODO(hughy): change this to use assertion instead of not undefined
    Assert.isNotUndefined(account.multiSigKeys, 'Account is not a multisig account')

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
