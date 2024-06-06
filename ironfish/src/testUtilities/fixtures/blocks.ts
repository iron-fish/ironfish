/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset, generateKey, Note as NativeNote } from '@ironfish/rust-nodejs'
import { Assert } from '../../assert'
import { Blockchain } from '../../blockchain'
import { FullNode } from '../../node'
import { Block, BlockSerde, SerializedBlock } from '../../primitives/block'
import { BurnDescription } from '../../primitives/burnDescription'
import { Note } from '../../primitives/note'
import { NoteEncrypted } from '../../primitives/noteEncrypted'
import { MintData, RawTransaction } from '../../primitives/rawTransaction'
import { Transaction } from '../../primitives/transaction'
import { Account, SpendingAccount, TransactionOutput, Wallet } from '../../wallet'
import { WorkerPool } from '../../workerPool/pool'
import { useAccountFixture } from './account'
import { FixtureGenerate, useFixture } from './fixture'
import {
  restoreTransactionFixtureToAccounts,
  usePostTxFixture,
  useTxFixture,
} from './transactions'
/*
 * We need the workaround because transactions related to us
 * that get added onto a block don't get handled in the same
 * way as if we created them, which is a problem. that's why
 * the transaction fixture uses accounts.createTransaction()
 * and not accountst.send(), so if its generated, and if its
 * cached, both have the same flow where we manually sync
 * them afterwards.
 */
export async function restoreBlockFixtureToAccounts(
  block: Block,
  wallet: Wallet,
): Promise<void> {
  for (const transaction of block.transactions) {
    await restoreTransactionFixtureToAccounts(transaction, wallet)
  }
}

/**
 * Executes a generator function which creates a block and
 * caches that in the fixtures folder next to the current test
 */
export async function useBlockFixture(
  chain: Blockchain,
  generate: FixtureGenerate<Block>,
  addTransactionsTo?: Wallet,
): Promise<Block> {
  return useFixture(generate, {
    process: async (block: Block): Promise<void> => {
      if (addTransactionsTo) {
        await restoreBlockFixtureToAccounts(block, addTransactionsTo)
      }
    },
    serialize: (block: Block): SerializedBlock => {
      return BlockSerde.serialize(block)
    },
    deserialize: (serialized: SerializedBlock): Block => {
      return BlockSerde.deserialize(serialized, chain)
    },
  })
}

/**
 * Generates a block with a miners fee transaction on the current chain state
 */
export async function useMinerBlockFixture(
  chain: Blockchain,
  sequence?: number,
  account?: Account,
  addTransactionsTo?: Wallet,
  transactions: Transaction[] = [],
): Promise<Block> {
  const spendingKey = account?.spendingKey ?? generateKey().spendingKey
  const transactionFees = transactions.reduce((a, t) => a + t.fee(), BigInt(0))

  return await useBlockFixture(
    chain,
    async () =>
      chain.newBlock(
        transactions,
        await chain.createMinersFee(
          transactionFees,
          sequence || chain.head.sequence + 1,
          spendingKey,
        ),
      ),
    addTransactionsTo,
  )
}

export async function useMintBlockFixture(options: {
  node: FullNode
  account: Account
  asset: Asset
  value: bigint
  transferOwnershipTo?: string
  sequence?: number
}): Promise<Block> {
  if (!options.sequence) {
    options.sequence = options.node.chain.head.sequence
  }

  const mint = await usePostTxFixture({
    node: options.node,
    wallet: options.node.wallet,
    from: options.account,
    mints: [
      {
        creator: options.asset.creator().toString('hex'),
        name: options.asset.name().toString('utf8'),
        metadata: options.asset.metadata().toString('utf8'),
        value: options.value,
        transferOwnershipTo: options.transferOwnershipTo,
      },
    ],
  })

  return useMinerBlockFixture(options.node.chain, options.sequence, undefined, undefined, [
    mint,
  ])
}

export async function useBurnBlockFixture(options: {
  node: FullNode
  account: Account
  asset: Asset
  value: bigint
  sequence?: number
}): Promise<Block> {
  if (!options.sequence) {
    options.sequence = options.node.chain.head.sequence
  }

  const burn = await usePostTxFixture({
    node: options.node,
    wallet: options.node.wallet,
    from: options.account,
    burns: [{ assetId: options.asset.id(), value: options.value }],
  })

  return useMinerBlockFixture(options.node.chain, options.sequence, undefined, undefined, [
    burn,
  ])
}

export async function useBlockWithRawTxFixture(
  chain: Blockchain,
  pool: WorkerPool,
  sender: Account,
  notesToSpend: NoteEncrypted[],
  outputs: { publicAddress: string; amount: bigint; memo: string; assetId: Buffer }[],
  mints: MintData[],
  burns: BurnDescription[],
  sequence: number,
): Promise<Block> {
  const generate = async () => {
    const spends = await Promise.all(
      notesToSpend.map(async (n) => {
        const note = n.decryptNoteForOwner(sender.incomingViewKey)
        Assert.isNotUndefined(note)
        const treeIndex = await chain.notes.leavesIndex.get(n.hash())
        Assert.isNotUndefined(treeIndex)
        const witness = await chain.notes.witness(treeIndex)
        Assert.isNotNull(witness)

        return {
          note,
          witness,
        }
      }),
    )

    const transactionVersion = chain.consensus.getActiveTransactionVersion(sequence)
    const raw = new RawTransaction(transactionVersion)
    raw.expiration = 0
    raw.mints = mints
    raw.burns = burns
    raw.fee = BigInt(0)
    raw.spends = spends

    for (const output of outputs) {
      const note = new NativeNote(
        output.publicAddress,
        output.amount,
        Buffer.from(output.memo, 'hex'),
        output.assetId,
        sender.publicAddress,
      )

      raw.outputs.push({ note: new Note(note.serialize()) })
    }

    Assert.isNotNull(sender.spendingKey)
    const transaction = await pool.postTransaction(raw, sender.spendingKey)

    return chain.newBlock(
      [transaction],
      await chain.createMinersFee(transaction.fee(), sequence, sender.spendingKey),
    )
  }

  return useBlockFixture(chain, generate)
}

/**
 * Produces a block with a transaction that has 1 spend, and 3 notes
 * By default first produces a block with a mining fee to fund the
 * {@link from} account and adds it to the chain.
 *
 * Returned block has 1 spend, 3 notes
 */
export async function useBlockWithTx(
  node: FullNode,
  from?: Account,
  to?: Account,
  useFee = true,
  options: {
    expiration?: number
    fee?: number
  } = { expiration: 0 },
): Promise<{
  account: Account
  previous: Block
  block: Block
  transaction: Transaction
}> {
  if (!from) {
    from = await useAccountFixture(node.wallet, 'test')
  }

  if (!to) {
    to = from
  }

  let previous: Block
  if (useFee) {
    previous = await useMinerBlockFixture(node.chain, 2, from)
    await node.chain.addBlock(previous)
    await node.wallet.scan()
  } else {
    const head = await node.chain.getBlock(node.chain.head)
    Assert.isNotNull(head)
    previous = head
  }

  const block = await useBlockFixture(node.chain, async () => {
    Assert.isNotUndefined(from)
    Assert.isNotUndefined(to)

    const raw = await node.wallet.createTransaction({
      account: from,
      outputs: [
        {
          publicAddress: to.publicAddress,
          amount: BigInt(1),
          memo: Buffer.alloc(32),
          assetId: Asset.nativeId(),
        },
      ],
      fee: BigInt(options.fee ?? 1n),
      expiration: options.expiration ?? 0,
      expirationDelta: 0,
    })

    Assert.isNotNull(from.spendingKey)
    const transaction = await node.workerPool.postTransaction(raw, from.spendingKey)

    return node.chain.newBlock(
      [transaction],
      await node.chain.createMinersFee(transaction.fee(), 3, generateKey().spendingKey),
    )
  })

  return { block, previous, account: from, transaction: block.transactions[1] }
}

/**
 * Produces a block with a multiple transaction that match the details of transactionInputs list
 * It first produces {@link transactionInputs.length} blocks all with mining fees to fund
 * the transactions
 *
 * Returned block with transactions matching the inputs in {@link transactionInputs}
 */
export async function useBlockWithCustomTxs(
  node: FullNode,
  transactionInputs: {
    fee?: bigint
    to?: SpendingAccount
    from: SpendingAccount
    outputs?: TransactionOutput[]
  }[],
): Promise<{
  block: Block
  transactions: Transaction[]
}> {
  // Fund each account that wants to send a transaction with a mined block
  for (const { from } of transactionInputs) {
    const previous = await useMinerBlockFixture(node.chain, node.chain.head.sequence + 1, from)
    await node.chain.addBlock(previous)
  }

  await node.wallet.scan()

  const block = await useBlockFixture(
    node.chain,
    async () => {
      const transactions: Transaction[] = []
      for (const { fee, to, from, outputs } of transactionInputs) {
        const raw = await node.wallet.createTransaction({
          account: from,
          outputs: outputs ?? [
            {
              publicAddress: to?.publicAddress ?? from.publicAddress,
              amount: BigInt(1),
              memo: Buffer.alloc(32),
              assetId: Asset.nativeId(),
            },
          ],
          fee: fee ?? 1n,
          expiration: 0,
          expirationDelta: 0,
        })

        const transaction = await node.workerPool.postTransaction(raw, from.spendingKey)

        await node.wallet.addPendingTransaction(transaction)
        transactions.push(transaction)
      }

      const transactionFees: bigint = transactions.reduce((sum, t) => {
        return BigInt(sum) + t.fee()
      }, BigInt(0))

      return node.chain.newBlock(
        transactions,
        await node.chain.createMinersFee(transactionFees, 3, generateKey().spendingKey),
      )
    },
    node.wallet,
  )

  return { block, transactions: block.transactions.slice(1) }
}

/**
 * Produces a block with a multiple transaction that have 1 spend, and 3 notes
 * It first produces {@link numTransactions} blocks all with mining fees to fund
 * the transactions
 *
 * Returned block has {@link numTransactions} transactions
 */
export async function useBlockWithTxs(
  node: FullNode,
  numTransactions: number,
  from?: SpendingAccount,
): Promise<{
  account: SpendingAccount
  block: Block
  transactions: Transaction[]
}> {
  if (!from) {
    from = await useAccountFixture(node.wallet, 'test')
  }

  const transactionInputs = new Array<{
    fee?: bigint
    to?: SpendingAccount
    from: SpendingAccount
    outputs?: TransactionOutput[]
  }>(numTransactions).fill({ from })

  const { block, transactions } = await useBlockWithCustomTxs(node, transactionInputs)

  return { block, transactions, account: from }
}

export async function useTxSpendsFixture(
  node: FullNode,
  options?: {
    account?: Account
    expiration?: number
    restore?: boolean
    fee?: bigint
  },
): Promise<{ account: Account; transaction: Transaction }> {
  const account = options?.account ?? (await useAccountFixture(node.wallet))

  const block = await useMinerBlockFixture(node.chain, 2, account, node.wallet)

  await expect(node.chain).toAddBlock(block)
  await node.wallet.scan()

  const transaction = await useTxFixture(
    node.wallet,
    account,
    account,
    undefined,
    options?.fee,
    options?.expiration,
    options?.restore,
  )

  return {
    account: account,
    transaction: transaction,
  }
}
