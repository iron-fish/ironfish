/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ApiNamespace, router } from '../router'
import { getAccount } from './utils'

export type GetPublicKeyRequest = { account?: string; generate: boolean }
export type GetPublicKeyResponse = { account: string; publicKey: string }

export const GetPublicKeyRequestSchema: yup.ObjectSchema<GetPublicKeyRequest> = yup
  .object({
    account: yup.string().strip(true),
    generate: yup.boolean().defined(),
  })
  .defined()

export const GetPublicKeyResponseSchema: yup.ObjectSchema<GetPublicKeyResponse> = yup
  .object({
    account: yup.string().defined(),
    publicKey: yup.string().defined(),
  })
  .defined()

router.register<typeof GetPublicKeyRequestSchema, GetPublicKeyResponse>(
  `${ApiNamespace.account}/getPublicKey`,
  GetPublicKeyRequestSchema,
  async (request, node): Promise<void> => {
    const account = getAccount(node, request.data.account)

    if (request.data.generate) {
      await node.accounts.generateNewPublicAddress(account)
    }

    request.end({
      account: account.name,
      publicKey: account.publicAddress,
    })
  },
)
