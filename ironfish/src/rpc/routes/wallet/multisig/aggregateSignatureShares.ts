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

export type AggregateSignatureSharesRequest = {
  account: string
  unsignedTransaction: string
  signingPackage: string
  signatureShares: Array<string>
}

export type AggregateSignatureSharesResponse = {
  transaction: string
}

export const AggregateSignatureSharesRequestSchema: yup.ObjectSchema<AggregateSignatureSharesRequest> =
  yup
    .object({
      account: yup.string().defined(),
      unsignedTransaction: yup.string().defined(),
      signingPackage: yup.string().defined(),
      signatureShares: yup.array(yup.string().defined()).defined(),
    })
    .defined()

export const AggregateSignatureSharesResponseSchema: yup.ObjectSchema<AggregateSignatureSharesResponse> =
  yup
    .object({
      transaction: yup.string().defined(),
    })
    .defined()

routes.register<typeof AggregateSignatureSharesRequestSchema, AggregateSignatureSharesResponse>(
  `${ApiNamespace.wallet}/multisig/aggregateSignatureShares`,
  AggregateSignatureSharesRequestSchema,
  (request, node): void => {
    AssertHasRpcContext(request, node, 'wallet')
    const account = getAccount(node.wallet, request.data.account)
    // TODO(hughy): change this to use assertion instead of not undefined
    Assert.isNotUndefined(account.multisigKeys, 'Account is not a multisig account')

    const unsigned = new UnsignedTransaction(
      Buffer.from(request.data.unsignedTransaction, 'hex'),
    )
    const transaction = unsigned.aggregateSignatureShares(
      account.multisigKeys.publicKeyPackage,
      request.data.signingPackage,
      request.data.signatureShares,
    )

    request.end({
      transaction: transaction.toString('hex'),
    })
  },
)
