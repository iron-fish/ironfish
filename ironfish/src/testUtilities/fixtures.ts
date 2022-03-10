/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { generateKey } from '@ironfish/rust-nodejs'
import fs from 'fs'
import path from 'path'
import { Account, Accounts } from '../account'
import { Assert } from '../assert'
import { Blockchain } from '../blockchain'
import { IronfishNode } from '../node'
import { Block, SerializedBlock } from '../primitives/block'
import { SerializedTransaction, Transaction } from '../primitives/transaction'
import { IJSON } from '../serde'
import { getCurrentTestPath } from './utils'

const FIXTURE_FOLDER = '__fixtures__'

type FixtureGenerate<T> = () => Promise<T> | T
type FixtureRestore<T> = (fixture: T) => Promise<void> | void
type FitxureDeserialize<T, TSerialized> = (data: TSerialized) => Promise<T> | T
type FixtureSerialize<T, TSerialized> = (fixture: T) => Promise<TSerialized> | TSerialized

const fixtureIds = new Map<string, { id: number; disabled: boolean }>()
const fixtureCache = new Map<string, Map<string, unknown[]>>()

export function shouldUpateFixtures(): boolean {
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

  const updateFixtures = shouldUpateFixtures()

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
  accounts: Accounts,
  generate: FixtureGenerate<Account> | string = 'test',
): Promise<Account> {
  if (typeof generate === 'string') {
    const name = generate
    generate = () => accounts.createAccount(name)
  }

  return useFixture(generate, {
    restore: async (account: Account): Promise<void> => {
      await accounts.importAccount(account)
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
  accounts: Accounts,
): Promise<void> {
  for (const transaction of block.transactions) {
    await restoreTransactionFixtureToAccounts(transaction, accounts)
  }
}

export async function restoreTransactionFixtureToAccounts(
  transaction: Transaction,
  accounts: Accounts,
): Promise<void> {
  await accounts.syncTransaction(transaction, { submittedSequence: 1 })
}

/**
 * Executes a generator function which creates a block and
 * caches that in the fixtures folder next to the current test
 */
export async function useBlockFixture(
  chain: Blockchain,
  generate: FixtureGenerate<Block>,
  addTransactionsTo?: Accounts,
): Promise<Block> {
  return useFixture(generate, {
    process: async (block: Block): Promise<void> => {
      if (addTransactionsTo) {
        await restoreBlockFixtureToAccounts(block, addTransactionsTo)
      }
    },
    serialize: (block: Block): SerializedBlock => {
      return chain.strategy.blockSerde.serialize(block)
    },
    deserialize: (serialized: SerializedBlock): Block => {
      return chain.strategy.blockSerde.deserialize(serialized)
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
  addTransactionsTo?: Accounts,
): Promise<Block> {
  const spendingKey = account ? account.spendingKey : generateKey().spending_key

  return await useBlockFixture(
    chain,
    async () =>
      chain.newBlock(
        [],
        await chain.strategy.createMinersFee(
          BigInt(0),
          sequence || chain.head.sequence + 1,
          spendingKey,
        ),
      ),
    addTransactionsTo,
  )
}

export async function useTxFixture(
  accounts: Accounts,
  from: Account,
  to: Account,
  generate?: FixtureGenerate<Transaction>,
  fee?: bigint,
  expiration?: number,
): Promise<Transaction> {
  generate =
    generate ||
    (() => {
      return accounts.createTransaction(
        from,
        [
          {
            publicAddress: to.publicAddress,
            amount: BigInt(1),
            memo: '',
          },
        ],
        fee ?? BigInt(0),
        expiration ?? 0,
      )
    })

  return useFixture(generate, {
    process: async (tx: Transaction): Promise<void> => {
      await restoreTransactionFixtureToAccounts(tx, accounts)
    },
    serialize: (tx: Transaction): SerializedTransaction => {
      return tx.serialize()
    },
    deserialize: (tx: SerializedTransaction): Transaction => {
      return new Transaction(tx, accounts.workerPool)
    },
  })
}

export async function useMinersTxFixture(
  accounts: Accounts,
  to?: Account,
  sequence?: number,
  amount = 0,
): Promise<Transaction> {
  if (!to) {
    to = await useAccountFixture(accounts)
  }

  return useTxFixture(accounts, to, to, () => {
    Assert.isNotUndefined(to)

    return accounts.chain.strategy.createMinersFee(
      BigInt(amount),
      sequence || accounts.chain.head.sequence + 1,
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
  const account = options?.account ?? (await useAccountFixture(node.accounts))

  const block = await useMinerBlockFixture(node.chain, 2, account, node.accounts)

  await expect(node.chain).toAddBlock(block)
  await node.accounts.updateHead()

  const transaction = await useTxFixture(
    node.accounts,
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
  } = { expiration: 0 },
): Promise<{ account: Account; previous: Block; block: Block; transaction: Transaction }> {
  if (!from) {
    from = await useAccountFixture(node.accounts, () => node.accounts.createAccount('test'))
  }

  if (!to) {
    to = from
  }

  let previous: Block
  if (useFee) {
    previous = await useMinerBlockFixture(node.chain, 2, from)
    await node.chain.addBlock(previous)
    await node.accounts.updateHead()
  } else {
    const head = await node.chain.getBlock(node.chain.head)
    Assert.isNotNull(head)
    previous = head
  }

  const block = await useBlockFixture(node.chain, async () => {
    Assert.isNotUndefined(from)
    Assert.isNotUndefined(to)

    const transaction = await node.accounts.createTransaction(
      from,
      [
        {
          publicAddress: to.publicAddress,
          amount: BigInt(1),
          memo: '',
        },
      ],
      BigInt(1),
      options.expiration ?? 0,
    )

    return node.chain.newBlock(
      [transaction],
      await node.strategy.createMinersFee(
        await transaction.fee(),
        3,
        generateKey().spending_key,
      ),
    )
  })

  return { block, previous, account: from, transaction: block.transactions[1] }
}
