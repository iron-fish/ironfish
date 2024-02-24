/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import { Assert } from '../../assert'
import { FullNode } from '../../node'
import { BurnDescription } from '../../primitives/burnDescription'
import { MintData } from '../../primitives/rawTransaction'
import { SerializedTransaction, Transaction } from '../../primitives/transaction'
import { UnsignedTransaction } from '../../primitives/unsignedTransaction'
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
  node: FullNode
  wallet: Wallet
  from: Account
  to?: Account
  fee?: bigint
  amount?: bigint
  expiration?: number
  assetId?: Buffer
  outputs?: {
    publicAddress: string
    amount: bigint
    memo: Buffer
    assetId: Buffer
  }[]
  mints?: MintData[]
  burns?: BurnDescription[]
  restore?: boolean
}): Promise<Transaction> {
  return useTxFixture(
    options.wallet,
    options.from,
    options.to || options.from,
    async () => {
      const raw = await createRawTransaction(options)
      Assert.isNotNull(options.from.spendingKey)
      return options.node.workerPool.postTransaction(raw, options.from.spendingKey)
    },
    undefined,
    undefined,
    options.restore,
  )
}

export async function useTxFixture(
  wallet: Wallet,
  from: Account,
  to: Account,
  generate?: FixtureGenerate<Transaction>,
  fee?: bigint,
  expiration?: number,
  restore = true,
): Promise<Transaction> {
  generate =
    generate ||
    (async () => {
      const raw = await wallet.createTransaction({
        account: from,
        outputs: [
          {
            publicAddress: to.publicAddress,
            amount: BigInt(1),
            memo: Buffer.alloc(32),
            assetId: Asset.nativeId(),
          },
        ],
        fee: fee ?? 0n,
        expiration: expiration ?? 0,
        expirationDelta: 0,
      })

      Assert.isNotNull(from.spendingKey)
      return await wallet.workerPool.postTransaction(raw, from.spendingKey)
    })

  return useFixture(generate, {
    process: async (tx: Transaction): Promise<void> => {
      if (restore) {
        await restoreTransactionFixtureToAccounts(tx, wallet)
      }
    },
    serialize: (tx: Transaction): SerializedTransaction => {
      return tx.serialize()
    },
    deserialize: (tx: SerializedTransaction): Transaction => {
      return new Transaction(tx)
    },
  })
}

export async function useUnsignedTxFixture(
  wallet: Wallet,
  from: Account,
  to: Account,
  generate?: FixtureGenerate<UnsignedTransaction>,
  fee?: bigint,
  expiration?: number,
): Promise<UnsignedTransaction> {
  generate =
    generate ||
    (async () => {
      const raw = await wallet.createTransaction({
        account: from,
        outputs: [
          {
            publicAddress: to.publicAddress,
            amount: BigInt(1),
            memo: Buffer.alloc(32),
            assetId: Asset.nativeId(),
          },
        ],
        fee: fee ?? 0n,
        expiration: expiration ?? 0,
        expirationDelta: 0,
      })
      Assert.isNotNull(from.proofAuthorizingKey)
      const unsignedBuffer = raw
        .build(from.proofAuthorizingKey, from.viewKey, from.outgoingViewKey)
        .serialize()
      return new UnsignedTransaction(unsignedBuffer)
    })
  return useFixture(generate, {
    serialize: (tx: UnsignedTransaction): Buffer => {
      return tx.serialize()
    },
    deserialize: (tx: Buffer): UnsignedTransaction => {
      return new UnsignedTransaction(tx)
    },
  })
}

export async function useMinersTxFixture(
  node: FullNode,
  to?: Account,
  sequence?: number,
  amount = 0,
): Promise<Transaction> {
  if (!to) {
    to = await useAccountFixture(node.wallet)
  }

  return useTxFixture(node.wallet, to, to, () => {
    Assert.isNotUndefined(to)
    Assert.isNotNull(to.spendingKey)

    return node.chain.createMinersFee(
      BigInt(amount),
      sequence || node.chain.head.sequence + 1,
      to.spendingKey,
    )
  })
}
