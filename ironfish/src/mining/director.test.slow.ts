/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { generateKey } from 'ironfish-wasm-nodejs'
import { SerializedBlockHeader, Target, Nullifier } from '../blockchain'
import { Captain } from '../captain'
import { RangeHasher } from '../merkletree'
import { MiningDirector } from './director'
import { waitForEmit } from '../event'
import { Account } from '../account'
import { Validity } from '../consensus/verifier'

import {
  TestStrategy,
  TestCaptain,
  TestTransaction,
  SerializedTestTransaction,
  makeCaptain,
  makeNullifier,
  makeFakeBlock,
  makeDb,
  makeDbName,
  makeNextBlock,
  blockHash,
  makeChainGenesis,
  TestMemPool,
} from '../captain/testUtilities'
import { MemPool } from '../memPool'

// Number of notes and nullifiers on the initial chain created by makeCaptain
const TEST_CHAIN_NUM_NOTES = 40
const TEST_CHAIN_NUM_NULLIFIERS = 16

function generateAccount(): Account {
  const key = generateKey()

  return {
    name: 'test',
    rescan: -1,
    incomingViewKey: key.incoming_view_key,
    outgoingViewKey: key.outgoing_view_key,
    publicAddress: key.public_address,
    spendingKey: key.spending_key,
  }
}

describe('Mining director', () => {
  const strategy = new TestStrategy(new RangeHasher())
  let captain: TestCaptain
  let targetSpy: jest.SpyInstance
  let targetMeetsSpy: jest.SpyInstance
  let isAddBlockValidSpy: jest.SpyInstance
  let memPool: TestMemPool
  let director: MiningDirector<
    string,
    string,
    TestTransaction,
    string,
    string,
    SerializedTestTransaction
  >

  beforeEach(async () => {
    const db = makeDb(makeDbName())
    const chain = await makeChainGenesis(strategy, db)
    captain = await Captain.new(db, strategy, chain)
    isAddBlockValidSpy = jest
      .spyOn(captain.chain.verifier, 'isAddBlockValid')
      .mockResolvedValue({
        valid: Validity.Yes,
      })
    for (let i = 1; i < 8 * 5; i++) {
      await chain.notes.add(`${i}`)

      if (i % 5 < 2) {
        await chain.nullifiers.add(makeNullifier(i))
      }

      if ((i + 1) % 5 === 0) {
        await chain.addBlock(await makeNextBlock(chain))
      }
    }

    memPool = new MemPool(captain)
    director = new MiningDirector(
      (captain as unknown) as Captain<
        string,
        string,
        TestTransaction<string>,
        string,
        string,
        SerializedTestTransaction<string>
      >,
      memPool,
    )
    director.setMinerAccount(generateAccount())

    targetSpy = jest.spyOn(Target, 'minDifficulty').mockImplementation(() => BigInt(1))
    targetMeetsSpy = jest.spyOn(Target, 'meets').mockImplementation(() => true)

    await director.start()
  })

  afterEach(async () => {
    await captain.shutdown()
    director.shutdown()
  })

  afterAll(() => {
    targetSpy.mockClear()
    targetMeetsSpy.mockClear()
    isAddBlockValidSpy.mockClear()
  })

  it('creates a new block to be mined when chain head changes', async () => {
    const chainHead = await captain.chain.getHeaviestHead()
    const listenPromise = waitForEmit(director.onBlockToMine)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await captain.chain.onChainHeadChange.emitAsync(chainHead!.recomputeHash())
    const [data] = await listenPromise
    const buffer = Buffer.from(data.bytes)
    const block = JSON.parse(buffer.toString()) as Partial<SerializedBlockHeader<string>>
    expect(data.target).toMatchInlineSnapshot(`
       Target {
         "targetValue": 115792089237316195423570985008687907853269984665640564039457584007913129639935n,
       }
     `)
    expect(block).toMatchSnapshot({ timestamp: expect.any(Number) })
  })

  it('adds transactions from the queue to a new block to be mined', async () => {
    director.memPool.acceptTransaction(
      new TestTransaction(true, ['abc', 'def'], 50, [
        { nullifier: makeNullifier(8), commitment: '0-3', size: 4 },
      ]),
    )

    director.memPool.acceptTransaction(
      new TestTransaction(true, ['jkl', 'mno'], 40, [
        { nullifier: makeNullifier(9), commitment: '0-3', size: 4 },
      ]),
    )
    const chainHead = await captain.chain.getHeaviestHead()
    expect(chainHead).toBeDefined()
    const listenPromise = waitForEmit(director.onBlockToMine)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await captain.chain.onChainHeadChange.emitAsync(chainHead!.recomputeHash())

    const result = (await listenPromise)[0]
    const buffer = Buffer.from(result.bytes)
    const block = JSON.parse(buffer.toString()) as SerializedBlockHeader<string>

    expect(block.noteCommitment.size).toBe(TEST_CHAIN_NUM_NOTES + 5)
    expect(block.nullifierCommitment.size).toBe(TEST_CHAIN_NUM_NULLIFIERS + 2)
    expect(block).toMatchSnapshot({ timestamp: expect.any(Number) })
    // Transactions stay in the queue until they are mined
    expect(director.memPool.size()).toBe(2)
  })

  it('does not add invalid transactions to the block', async () => {
    director.memPool.acceptTransaction(
      new TestTransaction(false, ['abc', 'def'], 50, [
        { nullifier: makeNullifier(8), commitment: 'ghi', size: 4 },
      ]),
    )

    director.memPool.acceptTransaction(
      new TestTransaction(false, ['jkl', 'mno'], 40, [
        { nullifier: makeNullifier(9), commitment: 'pqr', size: 4 },
      ]),
    )

    const chainHead = await captain.chain.getHeaviestHead()
    expect(chainHead).toBeDefined()
    const listenPromise = waitForEmit(director.onBlockToMine)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await captain.chain.onChainHeadChange.emitAsync(chainHead!.recomputeHash())

    const result = (await listenPromise)[0]
    const buffer = Buffer.from(result.bytes)
    const block = JSON.parse(buffer.toString()) as SerializedBlockHeader<string>

    expect(block.noteCommitment.size).toBe(TEST_CHAIN_NUM_NOTES + 1)
    expect(block.nullifierCommitment.size).toBe(TEST_CHAIN_NUM_NULLIFIERS)
    expect(block).toMatchSnapshot({ timestamp: expect.any(Number) })
    expect(director.memPool.size()).toBe(0)
  })
})

// TODO: Move these to MemPool
describe('isValidTransaction', () => {
  const strategy = new TestStrategy(new RangeHasher())
  let captain: TestCaptain
  let memPool: TestMemPool

  beforeEach(async () => {
    captain = await makeCaptain(strategy)
    memPool = new MemPool(captain)
  })

  afterEach(async () => {
    await captain.shutdown()
  })

  it('is not valid if the spend was seen in other transactions in this block', async () => {
    const transaction = new TestTransaction(true, ['abc', 'def'], 50, [
      { nullifier: makeNullifier(8), commitment: '0-3', size: 4 },
    ])

    const beforeSize = TEST_CHAIN_NUM_NULLIFIERS
    const seenNullifiers = [makeNullifier(8)]
    const isValid = await memPool.isValidTransaction(transaction, beforeSize, seenNullifiers)
    expect(isValid).toBe(false)
  })

  it('is not valid if the spend was seen in a previous block', async () => {
    const aPreviousNullifier = await captain.chain.nullifiers.get(4)

    const transaction = new TestTransaction(true, ['abc', 'def'], 50, [
      { nullifier: aPreviousNullifier, commitment: '0-3', size: 4 },
    ])

    const beforeSize = TEST_CHAIN_NUM_NULLIFIERS
    const seenNullifiers: Nullifier[] = []
    const isValid = await memPool.isValidTransaction(transaction, beforeSize, seenNullifiers)
    expect(isValid).toBe(false)
  })

  it('Updates seenNullifiers with valid transactions', async () => {
    const seenNullifiers: Nullifier[] = []
    const beforeSize = TEST_CHAIN_NUM_NULLIFIERS
    let transaction = new TestTransaction(true, ['abc', 'def'], 50, [
      { nullifier: makeNullifier(8), commitment: '0-3', size: 4 },
    ])
    let isValid = await memPool.isValidTransaction(transaction, beforeSize, seenNullifiers)
    expect(isValid).toBe(true)
    expect(seenNullifiers).toHaveLength(1)

    transaction = new TestTransaction(true, ['jkl', 'mno'], 40, [
      { nullifier: makeNullifier(9), commitment: '0-3', size: 4 },
    ])
    isValid = await memPool.isValidTransaction(transaction, beforeSize, seenNullifiers)
    expect(isValid).toBe(true)
    expect(seenNullifiers).toHaveLength(2)
  })
})

describe('successfullyMined', () => {
  const strategy = new TestStrategy(new RangeHasher())
  let captain: TestCaptain
  let memPool: TestMemPool
  let director: MiningDirector<
    string,
    string,
    TestTransaction,
    string,
    string,
    SerializedTestTransaction
  >

  beforeEach(async () => {
    captain = await makeCaptain(strategy)
    memPool = new MemPool(captain)
    director = new MiningDirector(
      (captain as unknown) as Captain<
        string,
        string,
        TestTransaction<string>,
        string,
        string,
        SerializedTestTransaction<string>
      >,
      memPool,
    )
    director.setMinerAccount(generateAccount())
  })

  afterEach(async () => {
    await captain.shutdown()
    director.shutdown()
  })

  it('emits nothing on mining if the block id is not known', () => {
    const mockSubmit = jest.fn()
    captain.emitBlock = mockSubmit

    director.successfullyMined(5, 0)
    expect(captain.emitBlock).not.toBeCalled()
  })

  it('submits nothing if the block invalid', () => {
    const mockSubmit = jest.fn()
    captain.emitBlock = mockSubmit

    const block = makeFakeBlock(strategy, blockHash(9), blockHash(10), 10, 8, 20)
    block.transactions[0].isValid = false
    director.recentBlocks.set(1, block)
    director.successfullyMined(5, 1)
    expect(captain.emitBlock).not.toBeCalled()
  })

  it('submits a validly mined block', () => {
    const mockSubmit = jest.fn()
    captain.emitBlock = mockSubmit

    const block = makeFakeBlock(strategy, blockHash(9), blockHash(10), 10, 8, 20)
    director.recentBlocks.set(2, block)
    director.successfullyMined(5, 2)
    expect(captain.emitBlock).toBeCalled()
  })
})

describe('Recalculating target', () => {
  const minDifficulty = Target.minDifficulty() as bigint
  const strategy = new TestStrategy(new RangeHasher())
  let captain: TestCaptain
  let memPool: TestMemPool
  let director: MiningDirector<
    string,
    string,
    TestTransaction,
    string,
    string,
    SerializedTestTransaction
  >
  jest.setTimeout(15000)

  beforeEach(async () => {
    jest.useFakeTimers()
    jest.setTimeout(15000000)
    captain = await makeCaptain(strategy)
    memPool = new MemPool(captain)
    director = new MiningDirector(
      (captain as unknown) as Captain<
        string,
        string,
        TestTransaction<string>,
        string,
        string,
        SerializedTestTransaction<string>
      >,
      memPool,
    )
    director.setMinerAccount(generateAccount())
    await director.start()
  })

  afterAll(async () => {
    jest.useRealTimers()
    await captain.shutdown()
    director.shutdown()
  })

  it('after 10 seconds the block header is updated and target is re-calculated if difficulty is high', async () => {
    const newTarget = Target.fromDifficulty(minDifficulty + BigInt(10000000000))
    jest.spyOn(Target, 'calculateTarget').mockReturnValueOnce(newTarget)

    const heaviestHeader = await director.captain.chain.getHeaviestHead()

    const spy = jest.spyOn(director, 'constructAndMineBlock')
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await director.onChainHeadChange(heaviestHeader!.recomputeHash())

    jest.advanceTimersByTime(11000)
    expect(spy).toBeCalledTimes(2)
  })

  it('after 10 seconds the block header is not updated and target is not re-calculated if difficulty is at minimum', async () => {
    const newTarget = Target.fromDifficulty(minDifficulty)
    jest.spyOn(Target, 'calculateTarget').mockReturnValueOnce(newTarget)

    const heaviestHeader = await director.captain.chain.getHeaviestHead()

    const spy = jest.spyOn(director, 'constructAndMineBlock')
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await director.onChainHeadChange(heaviestHeader!.recomputeHash())

    jest.advanceTimersByTime(11000)
    expect(spy).toBeCalledTimes(1)
  })
})
