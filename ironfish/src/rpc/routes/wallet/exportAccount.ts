/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { LanguageKey, LanguageUtils } from '../../../utils'
import { AccountFormat, encodeAccountImport, toAccountImport } from '../../../wallet/exporter'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'
import { getAccount } from './utils'
import { decrypt } from '@ironfish/rust-nodejs'

export type ExportAccountRequest = {
  account?: string
  viewOnly?: boolean
  format?: AccountFormat
  language?: LanguageKey
  passphrase?: string
}

export type ExportAccountResponse = {
  account: string
}

export const ExportAccountRequestSchema: yup.ObjectSchema<ExportAccountRequest> = yup
  .object({
    account: yup.string().trim(),
    viewOnly: yup.boolean().optional().default(false),
    format: yup.string().oneOf(Object.values(AccountFormat)).optional(),
    language: yup.string().oneOf(LanguageUtils.LANGUAGE_KEYS).optional(),
    passphrase: yup.string().trim(),
  })
  .defined()

export const ExportAccountResponseSchema: yup.ObjectSchema<ExportAccountResponse> = yup
  .object({
    account: yup.string().defined(),
  })
  .defined()

routes.register<typeof ExportAccountRequestSchema, ExportAccountResponse>(
  `${ApiNamespace.wallet}/exportAccount`,
  ExportAccountRequestSchema,
  (request, node): void => {
    AssertHasRpcContext(request, node, 'wallet')

    const format = request.data.format ?? AccountFormat.Base64Json
    const viewOnly = request.data.viewOnly ?? false

    const account = getAccount(node.wallet, request.data.account)
    if (account.encryptedSpendingKey && account.salt && account.nonce && request.data.passphrase) {
      const decrypted = decrypt(request.data.passphrase, account.salt, account.nonce, account.encryptedSpendingKey)
      request.end({ account: decrypted })
      return;
    }

    const value = toAccountImport(account, viewOnly)

    const encoded = encodeAccountImport(value, format, {
      language: request.data.language,
    })

    request.end({ account: encoded })
  },
)
