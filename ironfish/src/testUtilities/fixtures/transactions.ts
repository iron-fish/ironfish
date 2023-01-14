/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import { Assert } from '../../assert'
import { IronfishNode } from '../../node'
import { BurnDescription } from '../../primitives/burnDescription'
import { MintDescription } from '../../primitives/mintDescription'
import { SerializedTransaction, Transaction } from '../../primitives/transaction'
import { Account, Wallet } from '../../wallet'
import { createRawTransaction } from '../helpers/transaction'
import { useAccountFixture } from './account'
import { FixtureGenerate, useFixture } from './fixture'

export async function restoreTransactionFixtureToAccounts(
  transaction: Transaction,
  wallet: Wallet,
): Promise<void> {
  await wallet.addPendingTransaction(transaction)
}

export async function usePostTxFixture(options: {
  node: IronfishNode
  wallet: Wallet
  from: Account
  to?: Account
  fee?: bigint
  amount?: bigint
  expiration?: number
  assetId?: Buffer
  receives?: {
    publicAddress: string
    amount: bigint
    memo: string
    assetId: Buffer
  }[]
  mints?: MintDescription[]
  burns?: BurnDescription[]
}): Promise<Transaction> {
  return useTxFixture(options.wallet, options.from, options.from, async () => {
    const raw = await createRawTransaction(options)
    return options.node.workerPool.postTransaction(raw)
  })
}

export async function useTxFixture(
  wallet: Wallet,
  from: Account,
  to: Account,
  generate?: FixtureGenerate<Transaction>,
  fee?: bigint,
  expiration?: number,
): Promise<Transaction> {
  generate =
    generate ||
    (async () => {
      const raw = await wallet.createTransaction(
        from,
        [
          {
            publicAddress: to.publicAddress,
            amount: BigInt(1),
            memo: '',
            assetId: Asset.nativeId(),
          },
        ],
        [],
        [],
        fee ?? BigInt(0),
        0,
        expiration ?? 0,
      )

      return await wallet.postTransaction(raw)
    })

  return useFixture(generate, {
    process: async (tx: Transaction): Promise<void> => {
      await restoreTransactionFixtureToAccounts(tx, wallet)
    },
    serialize: (tx: Transaction): SerializedTransaction => {
      return tx.serialize()
    },
    deserialize: (tx: SerializedTransaction): Transaction => {
      return new Transaction(tx)
    },
  })
}

export async function useMinersTxFixture(
  wallet: Wallet,
  to?: Account,
  sequence?: number,
  amount = 0,
): Promise<Transaction> {
  if (!to) {
    to = await useAccountFixture(wallet)
  }

  return useTxFixture(wallet, to, to, () => {
    Assert.isNotUndefined(to)

    return wallet.chain.strategy.createMinersFee(
      BigInt(amount),
      sequence || wallet.chain.head.sequence + 1,
      to.spendingKey,
    )
  })
}
