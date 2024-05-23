/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { LanguageKey, LanguageUtils } from '../../../utils'
import { AccountFormat, encodeAccountImport } from '../../../wallet/exporter/account'
import { toAccountImport } from '../../../wallet/exporter/accountImport'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'
import { serializeRpcImportAccount } from '../wallet/utils'
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

    const viewOnly = request.data.viewOnly ?? false
    const account = getAccount(node.wallet, request.data.account)

    if (request.data.format) {
      const value = toAccountImport(account, viewOnly)

      const encoded = encodeAccountImport(value, request.data.format, {
        language: request.data.language,
      })

      request.end({ account: encoded })
      return
    }

    // For backwards compatibility, we must send back an RpcAccountImport
    const exported = toAccountImport(account, viewOnly)
    const serialized = serializeRpcImportAccount(exported)
    request.end({ account: serialized })
  },
)
