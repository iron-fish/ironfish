/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Blockchain } from '../../blockchain'
import { AssertSpending, SpendingAccount, Wallet } from '../../wallet'
import { DecryptedAccountValue } from '../../wallet/walletdb/accountValue'
import { HeadValue } from '../../wallet/walletdb/headValue'
import { useMinerBlockFixture } from './blocks'
import { FixtureGenerate, useFixture } from './fixture'

export function useAccountFixture(
  wallet: Wallet,
  generate: FixtureGenerate<SpendingAccount> | string = 'test',
  options?: Parameters<Wallet['createAccount']>[1],
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
      value: DecryptedAccountValue
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
      value: DecryptedAccountValue
      head: HeadValue | null
    }): Promise<SpendingAccount> => {
      const createdAt = value.createdAt
        ? { ...value.createdAt, networkId: wallet.networkId }
        : null
      const account = await wallet.importAccount({
        ...value,
        createdAt,
      })
      await account.updateHead(head)
      AssertSpending(account)
      return account
    },
  })
}

export async function useAccountAndAddFundsFixture(
  wallet: Wallet,
  chain: Blockchain,
  generate: FixtureGenerate<SpendingAccount> | string = 'test',
  options?: Parameters<Wallet['createAccount']>[1],
): Promise<SpendingAccount> {
  const account = await useAccountFixture(wallet, generate, options)
  const block = await useMinerBlockFixture(chain, undefined, account)
  await expect(chain).toAddBlock(block)
  const scan = await wallet.scan()
  await scan?.wait()
  return account
}
