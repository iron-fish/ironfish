/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { ApiNamespace, router } from '../router'
import { getAccount } from './utils'

export type UseAccountRequest = { account: string }
export type UseAccountResponse = undefined

export const UseAccountRequestSchema: yup.ObjectSchema<UseAccountRequest> = yup
  .object({
    account: yup.string().defined(),
  })
  .defined()

export const UseAccountResponseSchema: yup.MixedSchema<UseAccountResponse> = yup
  .mixed()
  .oneOf([undefined] as const)

router.register<typeof UseAccountRequestSchema, UseAccountResponse>(
  `${ApiNamespace.wallet}/use`,
  UseAccountRequestSchema,
  async (request, { node }): Promise<void> => {
    Assert.isNotUndefined(node)

    const account = getAccount(node.wallet, request.data.account)
    await node.wallet.setDefaultAccount(account.name)
    request.end()
  },
)
