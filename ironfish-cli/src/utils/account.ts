/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { RpcClient } from '@ironfish/sdk'
import * as ui from '../ui'

export async function useAccount(
  client: RpcClient,
  account: string | undefined,
  message?: string,
): Promise<string> {
  if (account !== undefined) {
    return account
  }

  const defaultAccount = await client.wallet.getAccounts({ default: true })

  if (defaultAccount.content.accounts.length) {
    return defaultAccount.content.accounts[0]
  }

  return ui.accountPrompt(client, message)
}
