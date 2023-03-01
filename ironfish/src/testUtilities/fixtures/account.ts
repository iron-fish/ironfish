/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../../assert'
import { WithNonNull } from '../../utils'
import { Account, AccountValue, Wallet } from '../../wallet'
import { FixtureGenerate, useFixture } from './fixture'

type SpendingAccount = WithNonNull<Account, 'spendingKey'>

function AssertSpending(account: Account): asserts account is SpendingAccount {
  Assert.isNotNull(account.spendingKey)
}

export function useAccountFixture(
  wallet: Wallet,
  generate: FixtureGenerate<SpendingAccount> | string = 'test',
): Promise<SpendingAccount> {
  if (typeof generate === 'string') {
    const name = generate

    generate = async (): Promise<SpendingAccount> => {
      const account = await wallet.createAccount(name)
      AssertSpending(account)
      return account
    }
  }

  return useFixture(generate, {
    serialize: (account: SpendingAccount): AccountValue => {
      return account.serialize()
    },

    deserialize: async (accountData: AccountValue): Promise<SpendingAccount> => {
      const createdAt = accountData.createdAt ? new Date(accountData.createdAt) : null
      const account = await wallet.importAccount({ ...accountData, createdAt })

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
