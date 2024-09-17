/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ApiNamespace } from '../../namespaces'
import { routes } from '../../router'
import { AssertHasRpcContext } from '../../rpcContext'

export type GetIdentitiesRequest = Record<string, never> | undefined

export type GetIdentitiesResponse = {
  identities: Array<{
    name: string
    identity: string
    hasSecret: boolean
  }>
}

export const GetIdentitiesRequestSchema: yup.MixedSchema<GetIdentitiesRequest> = yup
  .mixed()
  .oneOf([undefined] as const)

export const GetIdentitiesResponseSchema: yup.ObjectSchema<GetIdentitiesResponse> = yup
  .object({
    identities: yup
      .array(
        yup
          .object({
            name: yup.string().defined(),
            identity: yup.string().defined(),
            hasSecret: yup.boolean().defined(),
          })
          .defined(),
      )
      .defined(),
  })
  .defined()

routes.register<typeof GetIdentitiesRequestSchema, GetIdentitiesResponse>(
  `${ApiNamespace.wallet}/multisig/getIdentities`,
  GetIdentitiesRequestSchema,
  async (request, context): Promise<void> => {
    AssertHasRpcContext(request, context, 'wallet')

    const identities = []

    for await (const [
      identity,
      { name, secret },
    ] of context.wallet.walletDb.multisigIdentities.getAllIter()) {
      identities.push({
        name,
        identity: identity.toString('hex'),
        hasSecret: secret ? true : false,
      })
    }

    request.end({ identities })
  },
)
