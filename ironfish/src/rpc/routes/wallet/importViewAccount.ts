/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { v4 as uuid } from 'uuid'
import * as yup from 'yup'
import { ApiNamespace, router } from '../router'
import { importAccount } from './utils'

export type ViewAccountImport = {
  name: string
  viewKey: string
  publicAddress: string
  incomingViewKey: string
  outgoingViewKey: string
  version: number
}

export type ImportViewAccountRequest = {
  account: ViewAccountImport
  rescan?: boolean
}

export type ImportViewAccountResponse = {
  name: string
  isDefaultAccount: boolean
}

export const ImportViewAccountRequestSchema: yup.ObjectSchema<ImportViewAccountRequest> = yup
  .object({
    rescan: yup.boolean().optional().default(true),
    account: yup
      .object({
        name: yup.string().defined(),
        viewKey: yup.string().defined(),
        publicAddress: yup.string().defined(),
        incomingViewKey: yup.string().defined(),
        outgoingViewKey: yup.string().defined(),
        version: yup.number().defined(),
      })
      .defined(),
  })
  .defined()

export const ImportViewAccountResponseSchema: yup.ObjectSchema<ImportViewAccountResponse> = yup
  .object({
    name: yup.string().defined(),
    isDefaultAccount: yup.boolean().defined(),
  })
  .defined()

router.register<typeof ImportViewAccountRequestSchema, ImportViewAccountResponse>(
  `${ApiNamespace.wallet}/importViewAccount`,
  ImportViewAccountRequestSchema,
  async (request, node): Promise<void> => {
    const accountValue = {
      id: uuid(),
      ...request.data.account,
      spendingKey: null,
    }
    const { account, isDefaultAccount } = await importAccount(
      node,
      accountValue,
      request.data.rescan,
    )

    request.end({
      name: account.name,
      isDefaultAccount,
    })
  },
)
