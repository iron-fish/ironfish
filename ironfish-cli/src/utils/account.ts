/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  ImportResponse,
  Logger,
  RPC_ERROR_CODES,
  RpcClient,
  RpcRequestError,
} from '@ironfish/sdk'
import * as ui from '../ui'
import { inputPrompt } from '../ui'

export async function useAccount(
  client: RpcClient,
  account: string | undefined,
  message?: string,
): Promise<string> {
  if (account !== undefined) {
    return account
  }

  const status = await client.wallet.getAccountsStatus()
  if (status.content.locked) {
    throw new Error('Wallet is locked. Unlock the wallet to fetch accounts')
  }

  const defaultAccount = await client.wallet.getAccounts({ default: true })

  if (defaultAccount.content.accounts.length) {
    return defaultAccount.content.accounts[0]
  }

  return ui.accountPrompt(client, message)
}

export async function importAccount(
  client: RpcClient,
  account: string,
  logger: Logger,
  accountName?: string,
  createdAt?: number,
  rescan?: boolean,
): Promise<ImportResponse> {
  let name = accountName

  let result
  while (!result) {
    try {
      result = await client.wallet.importAccount({
        account,
        name,
        rescan,
        createdAt,
      })
    } catch (e) {
      if (
        e instanceof RpcRequestError &&
        (e.code === RPC_ERROR_CODES.DUPLICATE_ACCOUNT_NAME.toString() ||
          e.code === RPC_ERROR_CODES.IMPORT_ACCOUNT_NAME_REQUIRED.toString() ||
          e.code === RPC_ERROR_CODES.DUPLICATE_IDENTITY_NAME.toString())
      ) {
        const message = 'Enter a name for the account'

        if (e.code === RPC_ERROR_CODES.DUPLICATE_ACCOUNT_NAME.toString()) {
          logger.info('')
          logger.info(e.codeMessage)
        }

        if (e.code === RPC_ERROR_CODES.DUPLICATE_IDENTITY_NAME.toString()) {
          logger.info('')
          logger.info(e.codeMessage)
        }

        const inputName = await inputPrompt(message, true)
        if (inputName === name) {
          throw new Error(`Entered the same name: '${name}'`)
        }

        name = inputName
        continue
      }

      throw e
    }
  }

  return result.content
}
