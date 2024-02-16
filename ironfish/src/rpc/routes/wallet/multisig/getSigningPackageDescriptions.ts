/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ApiNamespace } from '../../namespaces'
import { routes } from '../../router'
import { AssertHasRpcContext } from '../../rpcContext'
import { getAccount } from '../utils'
import { UnsignedTransaction } from '@ironfish/sdk'

export type GetSigningPackageDescriptionsRequest = {
  account?: string
  signingPackage: string
}

export type GetSigningPackageDescriptionsResponse = {
  receivedNotes: string[]
  spentNotes: string[]
  mints: string[]
  burns: string[]
}

export const GetSigningPackageDescriptionsRequestSchema: yup.ObjectSchema<GetSigningPackageDescriptionsRequest> =
  yup
    .object({
      account: yup.string().optional(),
      signingPackage: yup.string().defined(),
    })
    .defined()

export const GetSigningPackageDescriptionsResponseSchema: yup.ObjectSchema<GetSigningPackageDescriptionsResponse> =
  yup
    .object({
      receivedNotes: yup.array(yup.string().defined()).defined(),
      spentNotes: yup.array(yup.string().defined()).defined(),
      mints: yup.array(yup.string().defined()).defined(),
      burns: yup.array(yup.string().defined()).defined(),
    })
    .defined()

routes.register<
  typeof GetSigningPackageDescriptionsRequestSchema,
  GetSigningPackageDescriptionsResponse
>(
  `${ApiNamespace.wallet}/multisig/getSigningPackageDescriptions`,
  GetSigningPackageDescriptionsRequestSchema,
  (request, context): void => {
    AssertHasRpcContext(request, context, 'wallet')
    const account = getAccount(context.wallet, request.data.account)
    const unsigned = UnsignedTransaction.fromSigningPackage(request.data.signingPackage)
    const descriptions = unsigned.descriptions(account.incomingViewKey, account.outgoingViewKey)
  },
)
