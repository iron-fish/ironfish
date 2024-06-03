/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Blockchain } from '../../blockchain'
import { AccountValue, AssertSpending, SpendingAccount, Wallet } from '../../wallet'
import { HeadValue } from '../../wallet/walletdb/headValue'
import { useMinerBlockFixture } from './blocks'
import { FixtureGenerate, useFixture } from './fixture'

export function useAccountFixture(
  wallet: Wallet,
  generate: FixtureGenerate<SpendingAccount> | string = 'test',
  options?: { createdAt?: HeadValue | null; setDefault?: boolean },
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

export async function useAccountAndAddFundsFixture(
  wallet: Wallet,
  chain: Blockchain,
  generate: FixtureGenerate<SpendingAccount> | string = 'test',
  options?: { createdAt?: HeadValue | null; setDefault?: boolean },
): Promise<SpendingAccount> {
  const account = await useAccountFixture(wallet, generate, options)
  const block = await useMinerBlockFixture(chain, undefined, account)
  await expect(chain).toAddBlock(block)
  await wallet.updateHead()
  return account
}
