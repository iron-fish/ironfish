/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { DecodeInvalidName } from '../../../wallet'
import { DuplicateAccountNameError } from '../../../wallet/errors'
import { AccountFormat, decodeAccountImport } from '../../../wallet/exporter/account'
import { decryptEncodedAccount } from '../../../wallet/exporter/encryption'
import { RPC_ERROR_CODES, RpcValidationError } from '../../adapters'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'

export class ImportError extends Error {}

export type ImportAccountRequest = {
  account: string
  name?: string
  rescan?: boolean
  createdAt?: number
  format?: AccountFormat
}

export type ImportResponse = {
  name: string
  isDefaultAccount: boolean
}

export const ImportAccountRequestSchema: yup.ObjectSchema<ImportAccountRequest> = yup
  .object({
    rescan: yup.boolean().optional().default(true),
    name: yup.string().optional(),
    account: yup.string().defined(),
    createdAt: yup.number().optional(),
    format: yup.mixed<AccountFormat>().oneOf(Object.values(AccountFormat)).optional(),
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
    try {
      AssertHasRpcContext(request, context, 'wallet')

      request.data.account = await decryptEncodedAccount(request.data.account, context.wallet)

      const decoded = decodeAccountImport(request.data.account, {
        name: request.data.name,
        format: request.data.format,
      })
      const account = await context.wallet.importAccount(decoded, {
        createdAt: request.data.createdAt,
      })

      if (!context.wallet.hasDefaultAccount) {
        await context.wallet.setDefaultAccount(account.name)
      }

      if (!request.data.rescan) {
        await context.wallet.skipRescan(account)
      }

      const isDefaultAccount = context.wallet.getDefaultAccount()?.id === account.id

      request.end({
        name: account.name,
        isDefaultAccount,
      })
    } catch (e) {
      if (e instanceof DuplicateAccountNameError) {
        throw new RpcValidationError(e.message, 400, RPC_ERROR_CODES.DUPLICATE_ACCOUNT_NAME)
      } else if (e instanceof DecodeInvalidName) {
        throw new RpcValidationError(
          e.message,
          400,
          RPC_ERROR_CODES.IMPORT_ACCOUNT_NAME_REQUIRED,
        )
      }
      throw e
    }
  },
)
