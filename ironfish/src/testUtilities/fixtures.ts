/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Accounts, Account } from '../account'
import { IJSON } from '../serde'
import fs from 'fs'
import path from 'path'
import { getCurrentTestPath } from './utils'
import { generateKey } from 'ironfish-wasm-nodejs'
import { IronfishBlock, IronfishBlockSerialized } from '../primitives/block'
import { IronfishBlockchain } from '../blockchain'

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
  generate: FixtureGenerate<Account> | string,
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
  block: IronfishBlock,
  accounts: Accounts,
): Promise<void> {
  for (const transaction of block.transactions) {
    await accounts.syncTransaction(transaction, { submittedSequence: 1 })
  }
}

/**
 * Executes a generator function which creates a block and
 * caches that in the fixtures folder next to the current test
 */
export async function useBlockFixture(
  chain: IronfishBlockchain,
  generate: FixtureGenerate<IronfishBlock>,
  addTransactionsTo?: Accounts,
): Promise<IronfishBlock> {
  return useFixture(generate, {
    process: async (block: IronfishBlock): Promise<void> => {
      if (addTransactionsTo) {
        await restoreBlockFixtureToAccounts(block, addTransactionsTo)
      }
    },
    serialize: (block: IronfishBlock): IronfishBlockSerialized => {
      return chain.strategy.blockSerde.serialize(block)
    },
    deserialize: (serialized: IronfishBlockSerialized): IronfishBlock => {
      return chain.strategy.blockSerde.deserialize(serialized)
    },
  })
}

/**
 * Generates a block with a miners fee transaction on the current chain state
 */
export async function useMinerBlockFixture(
  chain: IronfishBlockchain,
  sequence: number,
  account?: Account,
  addTransactionsTo?: Accounts,
): Promise<IronfishBlock> {
  const spendingKey = account ? account.spendingKey : generateKey().spending_key

  return await useBlockFixture(
    chain,
    async () =>
      chain.newBlock(
        [],
        await chain.strategy.createMinersFee(BigInt(0), sequence, spendingKey),
      ),
    addTransactionsTo,
  )
}
