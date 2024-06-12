/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Blockchain } from '../../blockchain'
import { Account, AccountValue, AssertSpending, SpendingAccount, Wallet } from '../../wallet'
import { toAccountImport } from '../../wallet/exporter'
import { HeadValue } from '../../wallet/walletdb/headValue'
import { useMinerBlockFixture } from './blocks'
import { FixtureGenerate, useFixture } from './fixture'

export function useAccountFixture(
  wallet: Wallet,
  generate: FixtureGenerate<SpendingAccount> | string = 'test',
  options?: { createdAt?: { sequence: number } | null; setDefault?: boolean },
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
    serialize: async (
      account: SpendingAccount,
    ): Promise<{
      value: AccountValue
      head: HeadValue | null
    }> => {
      return {
        value: account.serialize(),
        head: await account.getHead(),
      }
    },

    deserialize: async ({
      value,
      head,
    }: {
      value: AccountValue
      head: HeadValue | null
    }): Promise<SpendingAccount> => {
      const account = new Account({ accountValue: value, walletDb: wallet.walletDb })
      const imported = await wallet.importAccount(
        toAccountImport(account, false, wallet.networkId),
      )
      await imported.updateHead(head)
      AssertSpending(imported)
      return imported
    },
  })
}

export async function useAccountAndAddFundsFixture(
  wallet: Wallet,
  chain: Blockchain,
  generate: FixtureGenerate<SpendingAccount> | string = 'test',
  options?: { createdAt?: { sequence: number } | null; setDefault?: boolean },
): Promise<SpendingAccount> {
  const account = await useAccountFixture(wallet, generate, options)
  const block = await useMinerBlockFixture(chain, undefined, account)
  await expect(chain).toAddBlock(block)
  const scan = await wallet.scan()
  await scan?.wait()
  return account
}
