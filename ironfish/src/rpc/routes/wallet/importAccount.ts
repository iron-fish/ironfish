/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { v4 as uuid } from 'uuid'
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { decodeAccount } from '../../../wallet/account/encoder/account'
import { ApiNamespace, router } from '../router'
import { RpcAccountImport } from './types'
import { deserializeRpcAccountImport } from './utils'

export class ImportError extends Error {}

export type ImportAccountRequest = {
  account: RpcAccountImport | string
  name?: string
  rescan?: boolean
}

export type ImportResponse = {
  name: string
  isDefaultAccount: boolean
}

export const ImportAccountRequestSchema: yup.ObjectSchema<ImportAccountRequest> = yup
  .object({
    rescan: yup.boolean().optional().default(true),
    name: yup.string().optional(),
    account: yup.mixed<RpcAccountImport | string>().defined(),
  })
  .defined()

export const ImportAccountResponseSchema: yup.ObjectSchema<ImportResponse> = yup
  .object({
    name: yup.string().defined(),
    isDefaultAccount: yup.boolean().defined(),
  })
  .defined()

router.register<typeof ImportAccountRequestSchema, ImportResponse>(
  `${ApiNamespace.wallet}/importAccount`,
  ImportAccountRequestSchema,
  async (request, { node }): Promise<void> => {
    Assert.isNotUndefined(node)

    let accountImport = null
    if (typeof request.data.account === 'string') {
      accountImport = decodeAccount(request.data.account, {
        name: request.data.name,
      })
    } else {
      accountImport = deserializeRpcAccountImport(request.data.account)
    }

    const account = await node.wallet.importAccount({
      id: uuid(),
      ...accountImport,
    })

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
