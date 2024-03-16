/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { multisig } from '@ironfish/rust-nodejs'
import * as yup from 'yup'
import { Transaction } from '../../../../primitives/transaction'
import { AssertMultisig } from '../../../../wallet'
import { ApiNamespace } from '../../namespaces'
import { routes } from '../../router'
import { AssertHasRpcContext } from '../../rpcContext'
import { getAccount } from '../utils'

export type AggregateSignatureSharesRequest = {
  account?: string
  signingPackage: string
  signatureShares: Array<string>
  broadcast?: boolean
}

export type AggregateSignatureSharesResponse = {
  accepted: boolean
  broadcasted: boolean
  transaction: string
}

export const AggregateSignatureSharesRequestSchema: yup.ObjectSchema<AggregateSignatureSharesRequest> =
  yup
    .object({
      account: yup.string().optional(),
      signingPackage: yup.string().defined(),
      signatureShares: yup.array(yup.string().defined()).defined(),
      broadcast: yup.boolean().optional().default(true),
    })
    .defined()

export const AggregateSignatureSharesResponseSchema: yup.ObjectSchema<AggregateSignatureSharesResponse> =
  yup
    .object({
      accepted: yup.boolean().defined(),
      broadcasted: yup.boolean().defined(),
      transaction: yup.string().defined(),
    })
    .defined()

routes.register<typeof AggregateSignatureSharesRequestSchema, AggregateSignatureSharesResponse>(
  `${ApiNamespace.wallet}/multisig/aggregateSignatureShares`,
  AggregateSignatureSharesRequestSchema,
  async (request, node): Promise<void> => {
    AssertHasRpcContext(request, node, 'wallet')
    const account = getAccount(node.wallet, request.data.account)
    AssertMultisig(account)

    const serialized = multisig.aggregateSignatureShares(
      account.multisigKeys.publicKeyPackage,
      request.data.signingPackage,
      request.data.signatureShares,
    )

    const transaction = new Transaction(serialized)

    let accepted = false
    let broadcasted = false

    if (request.data.broadcast) {
      await node.wallet.addPendingTransaction(transaction)
      const result = await node.wallet.broadcastTransaction(transaction)
      accepted = result.accepted
      broadcasted = result.broadcasted
    }

    request.end({
      accepted,
      broadcasted,
      transaction: serialized.toString('hex'),
    })
  },
)
