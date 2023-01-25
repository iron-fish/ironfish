/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bs58safe from 'bs58check-ts'
import * as yup from 'yup'
import { Account, AccountImport } from '../../../wallet/account'
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
    let account: Account | null = null
    try {
      account = await node.wallet.importAccount(request.data.account)
    } catch (hexImportError: unknown) {
      try {
        request.data.account.spendingKey = bs58safe
          .decode(request.data.account.spendingKey)
          .toString('hex')
        account = await node.wallet.importAccount(request.data.account)
      } catch (base58Error) {
        if (hexImportError instanceof Error && base58Error instanceof Error) {
          throw new Error(
            `Failed to import account. When trying passed key as hex, got ${hexImportError.message}. When trying passed key as base58, got ${base58Error.message}`,
          )
        } else {
          throw new Error(
            'Failed to import account, and could not process returned errors when passing spending key to wallet.',
          )
        }
      }
    }

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
