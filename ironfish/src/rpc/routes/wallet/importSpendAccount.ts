/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { generateKeyFromPrivateKey } from '@ironfish/rust-nodejs'
import { v4 as uuid } from 'uuid'
import * as yup from 'yup'
import { ApiNamespace, router } from '../router'
import { importAccount, ImportResponse } from './utils'

export type SpendingAccountImport = { name: string; spendingKey: string; version: number }

export type ImportSpendAccountRequest = {
  account: SpendingAccountImport
  rescan?: boolean
}

export const ImportSpendAccountRequestSchema: yup.ObjectSchema<ImportSpendAccountRequest> = yup
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

export const ImportSpendAccountResponseSchema: yup.ObjectSchema<ImportResponse> = yup
  .object({
    name: yup.string().defined(),
    isDefaultAccount: yup.boolean().defined(),
  })
  .defined()

router.register<typeof ImportSpendAccountRequestSchema, ImportResponse>(
  `${ApiNamespace.wallet}/importSpendAccount`,
  ImportSpendAccountRequestSchema,
  async (request, node): Promise<void> => {
    const accountValue = {
      id: uuid(),
      ...request.data.account,
      ...generateKeyFromPrivateKey(request.data.account.spendingKey),
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
