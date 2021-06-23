/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ApiNamespace, router } from '../router'

export type ImportAccountRequest = {
  account: {
    name: string
    spendingKey: string
    incomingViewKey: string
    outgoingViewKey: string
    publicAddress: string
  }
  rescan?: boolean
}

export type ImportAccountResponse = {
  name: string
  isDefaultAccount: boolean
}

export const ImportAccountRequestSchema: yup.ObjectSchema<ImportAccountRequest> = yup
  .object({
    rescan: yup.boolean().optional().default(true),
    account: yup
      .object({
        name: yup.string().defined(),
        spendingKey: yup.string().defined(),
        incomingViewKey: yup.string().defined(),
        outgoingViewKey: yup.string().defined(),
        publicAddress: yup.string().defined(),
      })
      .defined(),
  })
  .defined()

export const ImportAccountResponseSchema: yup.ObjectSchema<ImportAccountResponse> = yup
  .object({
    name: yup.string().defined(),
    isDefaultAccount: yup.boolean().defined(),
  })
  .defined()

router.register<typeof ImportAccountRequestSchema, ImportAccountResponse>(
  `${ApiNamespace.account}/importAccount`,
  ImportAccountRequestSchema,
  async (request, node): Promise<void> => {
    const account = await node.accounts.importAccount(request.data.account)
    void node.accounts.startScanTransactionsFor(account)

    let isDefaultAccount = false
    if (!node.accounts.hasDefaultAccount) {
      await node.accounts.setDefaultAccount(account.name)
      isDefaultAccount = true
    }

    request.end({
      name: account.name,
      isDefaultAccount,
    })
  },
)
