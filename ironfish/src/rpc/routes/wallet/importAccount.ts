/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { v4 as uuid } from 'uuid'
import * as yup from 'yup'
import { decodeAccount } from '../../../wallet/account/encoder/account'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'
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

routes.register<typeof ImportAccountRequestSchema, ImportResponse>(
  `${ApiNamespace.wallet}/importAccount`,
  ImportAccountRequestSchema,
  async (request, context): Promise<void> => {
    AssertHasRpcContext(request, context, 'wallet')

    let accountImport = null
    if (typeof request.data.account === 'string') {
      accountImport = decodeAccount(request.data.account, {
        name: request.data.name,
      })
    } else {
      accountImport = deserializeRpcAccountImport(request.data.account)
    }

    const account = await context.wallet.importAccount({
      id: uuid(),
      ...accountImport,
    })

    if (request.data.rescan) {
      if (context.wallet.nodeClient) {
        void context.wallet.scanTransactions(undefined, true)
      }
    } else {
      await context.wallet.skipRescan(account)
    }

    let isDefaultAccount = false
    if (!context.wallet.hasDefaultAccount) {
      await context.wallet.setDefaultAccount(account.name)
      isDefaultAccount = true
    }

    request.end({
      name: account.name,
      isDefaultAccount,
    })
  },
)
