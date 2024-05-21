/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { LanguageKey, LanguageUtils } from '../../../utils'
import { encodeAccount } from '../../../wallet/exporter/account'
import { AccountFormat } from '../../../wallet/exporter/encoder'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'
import { RpcAccountImport } from './types'
import { getAccount } from './utils'

export type ExportAccountRequest = {
  account?: string
  viewOnly?: boolean
  format?: AccountFormat
  language?: LanguageKey
}
export type ExportAccountResponse = {
  account: string | RpcAccountImport | null
}

export const ExportAccountRequestSchema: yup.ObjectSchema<ExportAccountRequest> = yup
  .object({
    account: yup.string().trim(),
    viewOnly: yup.boolean().optional().default(false),
    format: yup.string().oneOf(Object.values(AccountFormat)).optional(),
    language: yup.string().oneOf(LanguageUtils.LANGUAGE_KEYS).optional(),
  })
  .defined()

export const ExportAccountResponseSchema: yup.ObjectSchema<ExportAccountResponse> = yup
  .object({
    account: yup.mixed<RpcAccountImport | string>().nullable(),
  })
  .defined()

routes.register<typeof ExportAccountRequestSchema, ExportAccountResponse>(
  `${ApiNamespace.wallet}/exportAccount`,
  ExportAccountRequestSchema,
  (request, node): void => {
    AssertHasRpcContext(request, node, 'wallet')

    const account = getAccount(node.wallet, request.data.account)
    const { id: _, ...accountInfo } = account.serialize()
    if (request.data.viewOnly) {
      accountInfo.spendingKey = null
      if (accountInfo.multisigKeys) {
        accountInfo.multisigKeys = {
          publicKeyPackage: accountInfo.multisigKeys.publicKeyPackage,
        }
      }
    }

    if (!request.data.format) {
      let createdAt = null
      if (accountInfo.createdAt) {
        createdAt = {
          hash: accountInfo.createdAt.hash.toString('hex'),
          sequence: accountInfo.createdAt.sequence,
        }
      }

      request.end({ account: { ...accountInfo, createdAt } })
    } else {
      const encoded = encodeAccount(accountInfo, request.data.format, {
        language: request.data.language,
      })
      request.end({ account: encoded })
    }
  },
)
