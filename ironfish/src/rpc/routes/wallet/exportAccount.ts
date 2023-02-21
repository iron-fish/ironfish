/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ApiNamespace, router } from '../router'
import { getAccount } from './utils'

export type ExportAccountRequest = { account?: string }
export type ExportAccountResponse = {
  account: {
    name: string
    spendingKey: string | null
    incomingViewKey: string
    outgoingViewKey: string
    publicAddress: string
    version: number
  }
}

export const ExportAccountRequestSchema: yup.ObjectSchema<ExportAccountRequest> = yup
  .object({
    account: yup.string().strip(true),
  })
  .defined()

export const ExportAccountResponseSchema: yup.ObjectSchema<ExportAccountResponse> = yup
  .object({
    account: yup
      .object({
        name: yup.string().defined(),
        spendingKey: yup.string().defined(),
        incomingViewKey: yup.string().defined(),
        outgoingViewKey: yup.string().defined(),
        publicAddress: yup.string().defined(),
        version: yup.number().defined(),
      })
      .defined(),
  })
  .defined()

router.register<typeof ExportAccountRequestSchema, ExportAccountResponse>(
  `${ApiNamespace.wallet}/exportAccount`,
  ExportAccountRequestSchema,
  (request, node): void => {
    const account = getAccount(node, request.data.account)
    const { id: _, ...accountInfo } = account.serialize()
    request.end({ account: accountInfo })
  },
)
