/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { AccountValue, AssertSpending, SpendingAccount, Wallet } from '../../wallet'
import { FixtureGenerate, useFixture } from './fixture'

export function useAccountFixture(
  wallet: Wallet,
  generate: FixtureGenerate<SpendingAccount> | string = 'test',
  options?: { setCreatedAt?: boolean; setDefault?: boolean },
): Promise<SpendingAccount> {
  if (typeof generate === 'string') {
    const name = generate

    generate = async (): Promise<SpendingAccount> => {
      const account = await wallet.createAccount(name, options)
      AssertSpending(account)
      return account
    }
  }

  return useFixture(generate, {
    serialize: (account: SpendingAccount): AccountValue => {
      return account.serialize()
    },

    deserialize: async (accountData: AccountValue): Promise<SpendingAccount> => {
      const account = await wallet.importAccount(accountData)

      if (accountData) {
        if (wallet.chainProcessor.hash && wallet.chainProcessor.sequence) {
          await account.updateHead({
            hash: wallet.chainProcessor.hash,
            sequence: wallet.chainProcessor.sequence,
          })
        } else {
          await account.updateHead(null)
        }
      }

      AssertSpending(account)
      return account
    },
  })
}
