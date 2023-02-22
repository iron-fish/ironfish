/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../../assert'
import { WithNonNull } from '../../utils'
import { Account, AccountValue, Wallet } from '../../wallet'
import { FixtureGenerate, useFixture } from './fixture'

type SpendingAccountValue = WithNonNull<AccountValue & { default: boolean }, 'spendingKey'>
export type SpendingAccount = WithNonNull<Account, 'spendingKey'>

export function useAccountFixture(
  wallet: Wallet,
  generate: FixtureGenerate<SpendingAccount> | string = 'test',
  setDefault = false,
): Promise<SpendingAccount> {
  if (typeof generate === 'string') {
    const name = generate
    generate = () => wallet.createAccount(name, setDefault) as Promise<SpendingAccount>
  }

  return useFixture(generate, {
    serialize: (account: SpendingAccount): SpendingAccountValue => {
      const serializedAccount = account.serialize()
      const { spendingKey } = serializedAccount
      Assert.isNotNull(spendingKey)
      return { ...serializedAccount, default: setDefault, spendingKey }
    },

    deserialize: async (accountData: SpendingAccountValue): Promise<SpendingAccount> => {
      const account = await wallet.importAccount(accountData)
      if (accountData.default) {
        await wallet.setDefaultAccount(account.name)
      }
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
      return account as SpendingAccount
    },
  })
}
