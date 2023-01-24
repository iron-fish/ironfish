/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { AccountImport } from '../../../wallet/account'
import { ApiNamespace, router } from '../router'
import bs58safe from 'bs58check-ts'

export type ImportAccountRequestBase58 = {
  account: AccountImport
  rescan?: boolean
}

export type ImportAccountResponseBase58 = {
  name: string
  isDefaultAccount: boolean
}

export const ImportAccountRequestBase58Schema: yup.ObjectSchema<ImportAccountRequestBase58> = yup
  .object({
    rescan: yup.boolean().optional().default(true),
    account: yup
      .object({
        name: yup.string().defined(),
        spendingKey: yup.string().defined(),
      })
      .defined(),
  })
  .defined()

export const ImportAccountResponseBase58Schema: yup.ObjectSchema<ImportAccountResponseBase58> = yup
  .object({
    name: yup.string().defined(),
    isDefaultAccount: yup.boolean().defined(),
  })
  .defined()

router.register<typeof ImportAccountRequestBase58Schema, ImportAccountResponseBase58>(
  `${ApiNamespace.wallet}/importAccountBase58`,
  ImportAccountRequestBase58Schema,
  async (request, node): Promise<void> => {
    request.data.account.spendingKey = bs58safe.decode(request.data.account.spendingKey).toString('hex')
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
