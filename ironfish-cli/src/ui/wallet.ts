/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { RpcClient } from '@ironfish/sdk'
import { inputPrompt } from './prompt'

export async function checkWalletUnlocked(client: Pick<RpcClient, 'wallet'>): Promise<void> {
  const status = await client.wallet.getAccountsStatus()
  if (!status.content.locked) {
    return
  }

  const passphrase = await inputPrompt('Enter your passphrase to unlock the wallet', true, {
    password: true,
  })

  await client.wallet.unlock({ passphrase })
}
