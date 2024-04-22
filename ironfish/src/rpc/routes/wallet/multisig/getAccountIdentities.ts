/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { AssertMultisig } from '../../../../wallet'
import { ApiNamespace } from '../../namespaces'
import { routes } from '../../router'
import { AssertHasRpcContext } from '../../rpcContext'
import { getAccount } from '../utils'

export type GetAccountIdentitiesRequest = {
  account?: string
}

export type GetAccountIdentitiesResponse = {
  identities: Array<string>
}
export const GetAccountIdentitiesRequestSchema: yup.ObjectSchema<GetAccountIdentitiesRequest> =
  yup
    .object({
      account: yup.string().optional(),
    })
    .defined()

export const GetAccountIdentitiesResponseSchema: yup.ObjectSchema<GetAccountIdentitiesResponse> =
  yup
    .object({
      identities: yup.array(yup.string().defined()).defined(),
    })
    .defined()

routes.register<typeof GetAccountIdentitiesRequestSchema, GetAccountIdentitiesResponse>(
  `${ApiNamespace.wallet}/multisig/getAccountIdentities`,
  GetAccountIdentitiesRequestSchema,
  (request, context): void => {
    AssertHasRpcContext(request, context, 'wallet')

    const account = getAccount(context.wallet, request.data.account)
    AssertMultisig(account)

    const identities = account
      .getMultisigParticipantIdentities()
      .map((identity) => identity.toString('hex'))

    request.end({ identities })
  },
)
