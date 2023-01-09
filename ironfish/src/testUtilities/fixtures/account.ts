/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Account, AccountValue, Wallet } from '../../wallet'
import { FixtureGenerate, useFixture } from './fixture'

export function useAccountFixture(
  wallet: Wallet,
  generate: FixtureGenerate<Account> | string = 'test',
): Promise<Account> {
  if (typeof generate === 'string') {
    const name = generate
    generate = () => wallet.createAccount(name)
  }

  return useFixture(generate, {
    serialize: (account: Account): AccountValue => {
      return account.serialize()
    },

    deserialize: async (accountData: AccountValue): Promise<Account> => {
      const account = await wallet.importAccount(accountData)
      if (wallet.chainProcessor.hash && wallet.chainProcessor.sequence) {
        await account.updateHead({
          hash: wallet.chainProcessor.hash,
          sequence: wallet.chainProcessor.sequence,
        })
      } else {
        await account.updateHead(null)
      }
      return account
    },
  })
}
