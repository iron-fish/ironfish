/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { AccountImport } from '../../../wallet/account'
import { ApiNamespace, router } from '../router'

export type ImportAccountRequest = {
  account: AccountImport
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
        version: yup.number().defined(),
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
  `${ApiNamespace.wallet}/importAccount`,
  ImportAccountRequestSchema,
  async (request, node): Promise<void> => {
    const account = await node.wallet.importAccount(request.data.account)

    if (request.data.rescan) {
      void node.wallet.scanTransactions()
    } else {
      await node.wallet.skipRescan(account)
    }

    let isDefaultAccount = false
    if (!node.wallet.hasDefaultAccount) {
      await node.wallet.setDefaultAccount(account.name)
      isDefaultAccount = true
    }

    request.end({
      name: account.name,
      isDefaultAccount,
    })
  },
)
