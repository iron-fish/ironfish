/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { DecodeInvalidName, MultisigSecretNotFound } from '../../../wallet'
import { decodeAccount } from '../../../wallet/exporter/account'
import { BASE64_JSON_MULTISIG_ENCRYPTED_ACCOUNT_PREFIX } from '../../../wallet/exporter/base64json'
import { DuplicateAccountNameError } from '../../../wallet/errors'
import { RPC_ERROR_CODES, RpcValidationError } from '../../adapters'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'
import { RpcAccountImport } from './types'
import { deserializeRpcAccountImport, tryDecodeAccountWithMultisigSecrets } from './utils'

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

    let account
    try {
      let accountImport = null
      if (typeof request.data.account === 'string') {
        const name = request.data.name

        if (request.data.account.startsWith(BASE64_JSON_MULTISIG_ENCRYPTED_ACCOUNT_PREFIX)) {
          accountImport = await tryDecodeAccountWithMultisigSecrets(
            context.wallet,
            request.data.account,
            { name },
          )
        }

        if (!accountImport) {
          accountImport = decodeAccount(request.data.account, { name })
        }
      } else {
        accountImport = deserializeRpcAccountImport(request.data.account)
        if (request.data.name) {
          accountImport.name = request.data.name
        }
      }

      account = await context.wallet.importAccount(accountImport)
    } catch (e) {
      if (e instanceof DuplicateAccountNameError) {
        throw new RpcValidationError(e.message, 400, RPC_ERROR_CODES.DUPLICATE_ACCOUNT_NAME)
      } else if (e instanceof DecodeInvalidName) {
        throw new RpcValidationError(
          e.message,
          400,
          RPC_ERROR_CODES.IMPORT_ACCOUNT_NAME_REQUIRED,
        )
      } else if (e instanceof MultisigSecretNotFound) {
        throw new RpcValidationError(e.message, 400, RPC_ERROR_CODES.MULTISIG_SECRET_NOT_FOUND)
      }
      throw e
    }

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
