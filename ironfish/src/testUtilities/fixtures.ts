/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset, generateKey } from '@ironfish/rust-nodejs'
import fs from 'fs'
import path from 'path'
import { Assert } from '../assert'
import { Blockchain } from '../blockchain'
import { NoteWitness } from '../merkletree/witness'
import { IronfishNode } from '../node'
import { Block, BlockSerde, SerializedBlock } from '../primitives/block'
import { Note } from '../primitives/note'
import { NoteEncrypted } from '../primitives/noteEncrypted'
import { SerializedTransaction, Transaction } from '../primitives/transaction'
import { IJSON } from '../serde'
import { Account, AccountValue, Wallet } from '../wallet'
import { WorkerPool } from '../workerPool/pool'
import { getCurrentTestPath } from './utils'

const FIXTURE_FOLDER = '__fixtures__'

type FixtureGenerate<T> = () => Promise<T> | T
type FixtureRestore<T> = (fixture: T) => Promise<void> | void
type FitxureDeserialize<T, TSerialized> = (data: TSerialized) => Promise<T> | T
type FixtureSerialize<T, TSerialized> = (fixture: T) => Promise<TSerialized> | TSerialized

const fixtureIds = new Map<string, { id: number; disabled: boolean }>()
const fixtureCache = new Map<string, Map<string, unknown[]>>()

export function shouldUpdateFixtures(): boolean {
  // Use the same parameters as jest snapshots for usability
  return process.argv.indexOf('--updateSnapshot') !== -1 || process.argv.indexOf('-u') !== -1
}

export function disableFixtures(): void {
  const testName = expect.getState().currentTestName.replace(/ /g, '_')
  const fixtureInfo = fixtureIds.get(testName) || { id: 0, disabled: false }
  fixtureIds.set(testName, fixtureInfo)
  fixtureInfo.disabled = true
}

export async function useFixture<TFixture, TSerialized = unknown>(
  generate: FixtureGenerate<TFixture>,
  options: {
    restore?: FixtureRestore<TFixture>
    process?: FixtureRestore<TFixture>
    deserialize?: FitxureDeserialize<TFixture, TSerialized>
    serialize?: FixtureSerialize<TFixture, TSerialized>
  } = {},
): Promise<TFixture> {
  const testPath = getCurrentTestPath()
  const testName = expect.getState().currentTestName
  const testDir = path.dirname(testPath)
  const testFile = path.basename(testPath)

  const fixtureInfo = fixtureIds.get(testName) || { id: -1, disabled: false }
  const fixtureId = (fixtureInfo.id += 1)
  fixtureIds.set(testName, fixtureInfo)

  const fixtureDir = path.join(testDir, FIXTURE_FOLDER)
  const fixtureName = `${testFile}.fixture`
  const fixturePath = path.join(fixtureDir, fixtureName)

  const updateFixtures = shouldUpdateFixtures()

  let fixtures = fixtureCache.get(testPath)

  // Load serialized fixtures in if they are not loaded
  if (!fixtures) {
    fixtures = new Map<string, TSerialized[]>()

    if (fs.existsSync(fixturePath)) {
      const buffer = await fs.promises.readFile(fixturePath)
      const data = IJSON.parse(buffer.toString('utf8')) as Record<string, TSerialized[]>

      for (const test in data) {
        fixtures.set(test, data[test])
      }
    }

    fixtureCache.set(testPath, fixtures)
  }

  let fixture: TFixture | null = null

  const serializedAll = fixtures.get(testName) || []
  fixtures.set(testName, serializedAll)

  if (!updateFixtures && !fixtureInfo.disabled && serializedAll[fixtureId]) {
    // deserialize existing fixture
    if (options.deserialize) {
      const serialized = serializedAll[fixtureId] as TSerialized
      fixture = await options.deserialize(serialized)
    } else {
      fixture = serializedAll[fixtureId] as TFixture
    }

    if (options.restore) {
      await options.restore(fixture)
    }
  } else {
    // generate the fixture
    fixture = await generate()
    const serialized = options.serialize ? await options?.serialize(fixture) : fixture
    serializedAll[fixtureId] = serialized

    if (!fs.existsSync(fixtureDir)) {
      await fs.promises.mkdir(fixtureDir)
    }

    const result = Object.fromEntries(fixtures.entries())
    const data = IJSON.stringify(result, '  ')
    await fs.promises.writeFile(fixturePath, data)
  }

  if (options.process) {
    await options.process(fixture)
  }

  return fixture
}

export async function useAccountFixture(
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

      await wallet.updateHeadHash(account, wallet.chainProcessor.hash)

      return account
    },
  })
}

/*
 * We need the workaround because transactions related to us
 * that get added onto a block don't get handled in the same
 * way as if we created them, which is a problem. that's why
 * the transaction fixture uses accounts.createTransaction()
 * and not accountst.pay(), so if its generated, and if its
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

export async function restoreTransactionFixtureToAccounts(
  transaction: Transaction,
  wallet: Wallet,
): Promise<void> {
  await wallet.syncTransaction(transaction, { submittedSequence: 1 })
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
      return BlockSerde.deserialize(serialized)
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
  const spendingKey = account ? account.spendingKey : generateKey().spending_key
  const transactionFees = transactions.reduce((a, t) => a + t.fee(), BigInt(0))

  return await useBlockFixture(
    chain,
    async () =>
      chain.newBlock(
        transactions,
        await chain.strategy.createMinersFee(
          transactionFees,
          sequence || chain.head.sequence + 1,
          spendingKey,
        ),
      ),
    addTransactionsTo,
  )
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
    (() => {
      return wallet.createTransaction(
        from,
        [
          {
            publicAddress: to.publicAddress,
            amount: BigInt(1),
            memo: '',
          },
        ],
        [],
        [],
        fee ?? BigInt(0),
        expiration ?? 0,
      )
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

export async function useRawTxFixture(
  chain: Blockchain,
  pool: WorkerPool,
  sender: Account,
  notesToSpend: NoteEncrypted[],
  receives: { publicAddress: string; amount: bigint; memo: string }[],
  mints: { asset: Asset; value: bigint }[],
  burns: { asset: Asset; value: bigint }[],
): Promise<Transaction> {
  const spends = await Promise.all(
    notesToSpend.map(async (n) => {
      const note = n.decryptNoteForOwner(sender.incomingViewKey)
      Assert.isNotUndefined(note)
      const treeIndex = await chain.notes.leavesIndex.get(n.merkleHash())
      Assert.isNotUndefined(treeIndex)
      const witness = await chain.notes.witness(treeIndex)
      Assert.isNotNull(witness)

      return {
        note,
        treeSize: witness.treeSize(),
        authPath: witness.authenticationPath,
        rootHash: witness.rootHash,
      }
    }),
  )

  return pool.createTransaction(
    sender.spendingKey,
    spends,
    receives,
    mints,
    burns,
    BigInt(0),
    0,
  )
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

export async function useTxSpendsFixture(
  node: IronfishNode,
  options?: {
    account?: Account
    expiration?: number
  },
): Promise<{ account: Account; transaction: Transaction }> {
  const account = options?.account ?? (await useAccountFixture(node.wallet))

  const block = await useMinerBlockFixture(node.chain, 2, account, node.wallet)

  await expect(node.chain).toAddBlock(block)
  await node.wallet.updateHead()

  const transaction = await useTxFixture(
    node.wallet,
    account,
    account,
    undefined,
    undefined,
    options?.expiration,
  )

  return {
    account: account,
    transaction: transaction,
  }
}

export async function useTxMintsAndBurnsFixture(
  wallet: Wallet,
  from: Account,
  mints: { asset: Asset; value: bigint }[],
  burns: { asset: Asset; value: bigint }[],
  generate?: FixtureGenerate<Transaction>,
  fee?: bigint,
  expiration?: number,
): Promise<Transaction> {
  generate =
    generate ||
    (() => {
      return wallet.createTransaction(from, [], mints, burns, fee ?? BigInt(0), expiration ?? 0)
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

/**
 * Produces a block with a transaction that has 1 spend, and 3 notes
 * By default first produces a block with a mining fee to fund the
 * {@link from} account and adds it to the chain.
 *
 * Returned block has 1 spend, 3 notes
 */
export async function useBlockWithTx(
  node: IronfishNode,
  from?: Account,
  to?: Account,
  useFee = true,
  options: {
    expiration?: number
    fee?: number
  } = { expiration: 0 },
): Promise<{ account: Account; previous: Block; block: Block; transaction: Transaction }> {
  if (!from) {
    from = await useAccountFixture(node.wallet, () => node.wallet.createAccount('test'))
  }

  if (!to) {
    to = from
  }

  let previous: Block
  if (useFee) {
    previous = await useMinerBlockFixture(node.chain, 2, from)
    await node.chain.addBlock(previous)
    await node.wallet.updateHead()
  } else {
    const head = await node.chain.getBlock(node.chain.head)
    Assert.isNotNull(head)
    previous = head
  }

  const block = await useBlockFixture(node.chain, async () => {
    Assert.isNotUndefined(from)
    Assert.isNotUndefined(to)

    const transaction = await node.wallet.createTransaction(
      from,
      [
        {
          publicAddress: to.publicAddress,
          amount: BigInt(1),
          memo: '',
        },
      ],
      [],
      [],
      BigInt(options.fee ?? 1),
      options.expiration ?? 0,
    )

    return node.chain.newBlock(
      [transaction],
      await node.strategy.createMinersFee(transaction.fee(), 3, generateKey().spending_key),
    )
  })

  return { block, previous, account: from, transaction: block.transactions[1] }
}

/**
 * Produces a block with a multiple transaction that have 1 spend, and 3 notes
 * It first produces {@link numTransactions} blocks all with mining fees to fund
 * the transactions
 *
 * Returned block has {@link numTransactions} transactions
 */
export async function useBlockWithTxs(
  node: IronfishNode,
  numTransactions: number,
  from?: Account,
): Promise<{ account: Account; block: Block; transactions: Transaction[] }> {
  if (!from) {
    from = await useAccountFixture(node.wallet, () => node.wallet.createAccount('test'))
  }
  const to = from

  let previous
  for (let i = 0; i < numTransactions; i++) {
    previous = await useMinerBlockFixture(node.chain, node.chain.head.sequence + 1, from)
    await node.chain.addBlock(previous)
  }

  await node.wallet.updateHead()

  const block = await useBlockFixture(node.chain, async () => {
    const transactions: Transaction[] = []
    for (let i = 0; i < numTransactions; i++) {
      Assert.isNotUndefined(from)

      const transaction = await node.wallet.createTransaction(
        from,
        [
          {
            publicAddress: to.publicAddress,
            amount: BigInt(1),
            memo: '',
          },
        ],
        [],
        [],
        BigInt(1),
        0,
      )
      await node.wallet.syncTransaction(transaction, {
        submittedSequence: node.chain.head.sequence,
      })
      transactions.push(transaction)
    }

    const transactionFees: bigint = transactions.reduce((sum, t) => {
      return BigInt(sum) + t.fee()
    }, BigInt(0))

    return node.chain.newBlock(
      transactions,
      await node.strategy.createMinersFee(transactionFees, 3, generateKey().spending_key),
    )
  })

  return { block, account: from, transactions: block.transactions.slice(1) }
}
