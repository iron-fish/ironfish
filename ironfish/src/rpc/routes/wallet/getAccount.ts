/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { RpcValidationError } from '../../adapters'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'

// eslint-disable-next-line @typescript-eslint/ban-types
export type GetAccountRequest = { name?: string; publicAddress?: string }
export type GetAccountResponse = {
  account: { name: string; publicAddress: string } | null
}

export const GetAccountRequestSchema: yup.ObjectSchema<GetAccountRequest> = yup
  .object({
    name: yup.string().optional(),
    publicAddress: yup.string().when('name', {
      is: (nameValue) => nameValue === undefined,
      then: yup.string().required(),
      otherwise: yup.string().oneOf([undefined]),
    }),
  })
  .defined()

export const GetAccountResponseSchema: yup.ObjectSchema<GetAccountResponse> = yup
  .object({
    account: yup
      .object({
        name: yup.string().defined(),
        publicAddress: yup.string().defined(),
      })
      .nullable()
      .defined(),
  })
  .defined()

routes.register<typeof GetAccountRequestSchema, GetAccountResponse>(
  `${ApiNamespace.wallet}/getAccount`,
  GetAccountRequestSchema,
  (request, node): void => {
    AssertHasRpcContext(request, node, 'wallet')

    let account
    if (request.data.name) {
      account = node.wallet.getAccountByName(request.data.name)
    } else if (request.data.publicAddress) {
      account = node.wallet.getAccountByPublicAddress(request.data.publicAddress)
    } else {
      throw new RpcValidationError(
        'Request must include either name or publicAddress to retrieve account',
      )
    }

    request.end({
      account: account ? { name: account.name, publicAddress: account.publicAddress } : null,
    })
  },
)
