/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Address } from '@ethereumjs/util'
import * as yup from 'yup'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'
import { getAccount } from './utils'

export type GetPublicKeyRequest = { account?: string }
export type GetPublicKeyResponse = {
  account: string
  publicKey: string
  evmPublicAddress?: string
}

export const GetPublicKeyRequestSchema: yup.ObjectSchema<GetPublicKeyRequest> = yup
  .object({
    account: yup.string().trim(),
  })
  .defined()

export const GetPublicKeyResponseSchema: yup.ObjectSchema<GetPublicKeyResponse> = yup
  .object({
    account: yup.string().defined(),
    publicKey: yup.string().defined(),
    evmPublicAddress: yup.string().optional(),
  })
  .defined()

routes.register<typeof GetPublicKeyRequestSchema, GetPublicKeyResponse>(
  `${ApiNamespace.wallet}/getPublicKey`,
  GetPublicKeyRequestSchema,
  (request, node): void => {
    AssertHasRpcContext(request, node, 'wallet')
    const account = getAccount(node.wallet, request.data.account)
    const evmPublicAddress = account.spendingKey
      ? Address.fromPrivateKey(Buffer.from(account.spendingKey, 'hex')).toString()
      : undefined
    request.end({
      account: account.name,
      publicKey: account.publicAddress,
      evmPublicAddress,
    })
  },
)
