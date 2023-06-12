/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable no-console */

import {
  NativeDecryptedNote,
  NativeDecryptNoteOptions,
  NativeWorkerPool,
} from '@ironfish/rust-nodejs'
import { Assert } from '../../assert'
import { Transaction } from '../../primitives'
import { createNodeTest, useAccountFixture, useBlockWithTxs } from '../../testUtilities'
import { BenchUtils, CurrencyUtils, PromiseUtils, SegmentResults } from '../../utils'
import { Account } from '../../wallet'
import { WorkerPool } from '../pool'
import { CreateMinersFeeRequest } from './createMinersFee'
import { DecryptNoteOptions, DecryptNotesRequest } from './decryptNotes'
import { WORKER_MESSAGE_HEADER_SIZE } from './workerMessage'

// TODO: All this boilerplate is probably unnecessary if you just construct and
// return a promise in the rust fn, if possible

class RustPool {
  nativeWorkerPool: NativeWorkerPool

  constructor(size: number) {
    this.nativeWorkerPool = new NativeWorkerPool(size)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wrapRustWorkerpoolFn<T>(fn: (cb: any, ...args: any[]) => void, ...args: any[]): Promise<T> {
    return new Promise((resolve, reject) => {
      const cb = (error: Error | null, result: T) => {
        if (error !== null) {
          reject(error)
        } else {
          resolve(result)
        }
      }
      fn.bind(this.nativeWorkerPool)(cb, ...args)
    })
  }

  sleep(ms: number): Promise<number> {
    return this.wrapRustWorkerpoolFn(this.nativeWorkerPool.sleep, ms)
  }

  decryptNotes(encrypted_notes: NativeDecryptNoteOptions): Promise<Array<NativeDecryptedNote>> {
    return this.wrapRustWorkerpoolFn(this.nativeWorkerPool.decryptNotes, encrypted_notes)
  }

  verifyTransactions(transactions: Array<Transaction>): Promise<boolean> {
    const txs = transactions.map((t) => t.serialize())
    return this.wrapRustWorkerpoolFn(this.nativeWorkerPool.verifyTransactions, txs)
  }
}

// TODO: Split into a different file
describe('Foo', () => {
  const nodeTest1 = createNodeTest()

  // Number of notes available for decrypt job is 2x this number
  const txCount = 50
  const notesToDecrypt = 100 // "real" code uses 20
  const transactionsToVerify = 50 // "real" code uses 10

  // let account: Account

  // beforeEac(async () => {
  //   account = await useAccountFixture(nodeTest.wallet, 'account')
  // })

  it('test non blocking responses', async () => {
    // const rsPool = new NativeWorkerPool(6)
    // const rsPool2 = new NativeWorkerPool(6)
    const rsPool = new RustPool(6)

    const promises: Array<Promise<number>> = []

    const x = await rsPool.sleep(500)
    console.log('X', x)

    const time1 = process.hrtime.bigint()

    for (let i = 0; i < 10; i++) {
      promises.push(rsPool.sleep(5_000 + i)) // Spawn ~5s sleep tasks
    }

    const time2 = process.hrtime.bigint()
    const dur2 = (time2 - time1) / 1000n // convert to microseconds
    console.log('Done spawning first batch of tasks, elapsed:', dur2)

    const chain = nodeTest1.node.chain
    // const latest = await chain.meta.get('latest')
    // console.log('Loading chain.meta.latest:', latest)
    const genesis = chain.genesis
    for await (const blockHeader of chain.iterateTo(genesis)) {
      console.log('Loaded blockHeader from DB:', blockHeader.hash)
    }

    console.log('Done loading from the DB')

    await Promise.all(promises)

    const time4 = process.hrtime.bigint()
    const dur4 = (time4 - time1) / 1000n // convert to microseconds
    console.log('Done waiting for all tasks, elapsed:', dur4)

    expect(true).toEqual(true)
  })

  it.only('ts', async () => {
    const nodeTest = await nodeTest1.createSetup()

    const account = await useAccountFixture(nodeTest.wallet, 'account')
    const account2 = await useAccountFixture(nodeTest.wallet, 'account2')

    const tsPool = new WorkerPool({ numWorkers: 1 })
    tsPool.start()

    // const start = process.hrtime.bigint()
    // console.log('Start - ts sleep:', start)
    // const job = tsPool.sleep(5000)
    // console.log('Kickoff Duration:', (process.hrtime.bigint() - start) / 1000n, 'microseconds')

    // const r = await job.result()
    // console.log('Final duration:', (process.hrtime.bigint() - start) / 1000n, 'micoroseconds')
    // console.log('Result: ', r)

    const { block, transactions } = await useBlockWithTxs(nodeTest.node, txCount, account)
    await expect(nodeTest.chain).toAddBlock(block)

    const accountToUse = account
    const payload: DecryptNoteOptions = {
      incomingViewKey: account.incomingViewKey,
      outgoingViewKey: account.outgoingViewKey,
      viewKey: account.viewKey,
      decryptForSpender: true,
      notes: [],
    }
    for (const transaction of transactions) {
      for (const note of transaction.notes) {
        payload.notes.push({
          serializedNote: note.serialize(),
          currentNoteIndex: 0,
        })
      }
    }
    // Warmup job
    const _foo = await tsPool.decryptNotes(payload)

    const start1 = process.hrtime.bigint()
    console.log('Start - ts decrypt:', start1)
    payload.notes = payload.notes.slice(0, notesToDecrypt)
    const job1 = tsPool.decryptNotes(payload)
    console.log('Kickoff Duration:', (process.hrtime.bigint() - start1) / 1000n, 'microseconds')

    const r1 = await job1
    console.log('Final duration:', (process.hrtime.bigint() - start1) / 1000n, 'micoroseconds')
    console.log('Result: ', r1.length)

    const start2 = process.hrtime.bigint()
    console.log('Start - ts verify:', start2)
    // const job2 = tsPool.verifyTransactions(transactions.slice(0, 10))
    const job2 = tsPool.verifyTransactions(transactions.slice(0, transactionsToVerify))
    console.log('Kickoff Duration:', (process.hrtime.bigint() - start2) / 1000n, 'microseconds')

    const r2 = await job2
    console.log('Final duration:', (process.hrtime.bigint() - start2) / 1000n, 'micoroseconds')
    console.log('Result: ', r2)

    await tsPool.stop()

    expect(true).toEqual(true)
  })

  it.only('rs', async () => {
    const nodeTest = await nodeTest1.createSetup()
    const account = await useAccountFixture(nodeTest.wallet, 'account')
    const account2 = await useAccountFixture(nodeTest.wallet, 'account2')

    // const rsPool = new NativeWorkerPool(4)
    const rsPool = new RustPool(1)

    // const start = process.hrtime.bigint()
    // console.log('Start - rs sleep:', start)
    // const job = rsPool.sleep(5000)
    // console.log('Kickoff Duration:', (process.hrtime.bigint() - start) / 1000n, 'microseconds')

    // const r = await job
    // console.log('Final duration:', (process.hrtime.bigint() - start) / 1000n, 'microseconds')
    // console.log('Result: ', r)

    const { block, transactions } = await useBlockWithTxs(nodeTest.node, txCount, account)
    await expect(nodeTest.chain).toAddBlock(block)

    const accountToUse = account
    const payload: NativeDecryptNoteOptions = {
      incomingViewKey: account.incomingViewKey,
      outgoingViewKey: account.outgoingViewKey,
      viewKey: account.viewKey,
      decryptForSpender: true,
      notes: [],
    }
    for (const transaction of transactions) {
      for (const note of transaction.notes) {
        payload.notes.push({
          serializedNote: note.serialize(),
          currentNoteIndex: 0,
        })
      }
    }

    // Warmup job
    const _foo = await rsPool.decryptNotes(payload)

    const start1 = process.hrtime.bigint()
    console.log('Start - rs decrypt:', start1)
    payload.notes = payload.notes.slice(0, notesToDecrypt)
    const job1 = rsPool.decryptNotes(payload)
    console.log('Kickoff Duration:', (process.hrtime.bigint() - start1) / 1000n, 'microseconds')

    const r1 = await job1
    console.log('Final duration:', (process.hrtime.bigint() - start1) / 1000n, 'micoroseconds')
    console.log('Result: ', r1.length)

    const start2 = process.hrtime.bigint()
    console.log('Start - rs verify:', start2)
    // const job2 = rsPool.verifyTransactions(transactions.slice(0, 10))
    const job2 = rsPool.verifyTransactions(transactions.slice(0, transactionsToVerify))
    console.log('Kickoff Duration:', (process.hrtime.bigint() - start2) / 1000n, 'microseconds')

    const r2 = await job2
    console.log('Final duration:', (process.hrtime.bigint() - start2) / 1000n, 'micoroseconds')
    console.log('Result: ', r2)

    expect(true).toEqual(true)
  })
})

describe('WorkerMessages', () => {
  const nodeTest = createNodeTest(true)

  const TEST_ITERATIONS = 50

  let account: Account

  beforeAll(async () => {
    account = await useAccountFixture(nodeTest.wallet, 'account')
  })

  it('createMinersFeeRequest', async () => {
    Assert.isNotNull(account.spendingKey)
    const message = new CreateMinersFeeRequest(
      CurrencyUtils.decodeIron(20),
      'hello world memo',
      account.spendingKey,
    )

    const expectedLength = message.getSize() + WORKER_MESSAGE_HEADER_SIZE

    const runs: number[] = []

    await PromiseUtils.sleep(1000)

    const segment = await BenchUtils.withSegment(() => {
      for (let i = 0; i < TEST_ITERATIONS; i++) {
        const start = BenchUtils.start()
        const buffer = message.serialize()
        runs.push(BenchUtils.end(start))

        expect(buffer.length).toEqual(expectedLength)
      }
    })

    expect(true).toBe(true)
    printResults('createMinersFeeRequest', runs, segment)
  })

  it('decryptNotes', async () => {
    const txCount = 50
    const { block, transactions } = await useBlockWithTxs(nodeTest.node, txCount, account)
    await expect(nodeTest.chain).toAddBlock(block)

    const payload: DecryptNoteOptions = {
      incomingViewKey: account.incomingViewKey,
      outgoingViewKey: account.outgoingViewKey,
      viewKey: account.viewKey,
      decryptForSpender: true,
      notes: [],
    }
    for (const transaction of transactions) {
      for (const note of transaction.notes) {
        payload.notes.push({
          serializedNote: note.serialize(),
          currentNoteIndex: 0,
        })
      }
    }

    expect(payload.notes.length).toEqual(100)

    const message = new DecryptNotesRequest(payload)

    const expectedLength = message.getSize() + WORKER_MESSAGE_HEADER_SIZE

    const runs: number[] = []

    await PromiseUtils.sleep(1000)

    const segment = await BenchUtils.withSegment(() => {
      for (let i = 0; i < TEST_ITERATIONS; i++) {
        const start = BenchUtils.start()
        const buffer = message.serialize()
        runs.push(BenchUtils.end(start))

        expect(buffer.length).toEqual(expectedLength)
      }
    })

    printResults('decryptNotes', runs, segment)
  })

  function printResults(testName: string, runs: number[], segment: SegmentResults) {
    let min = Number.MAX_SAFE_INTEGER
    let max = 0
    let total = 0
    for (const elapsed of runs) {
      min = Math.min(elapsed, min)
      max = Math.max(elapsed, max)
      total += elapsed
    }
    const average = total / runs.length

    console.log(
      `[TEST RESULTS: Message: ${testName}, Iterations: ${TEST_ITERATIONS}]` +
        `\nTotal elapsed: ${total} milliseconds` +
        `\nFastest: ${min} milliseconds` +
        `\nSlowest: ${max} milliseconds` +
        `\nAverage: ${average} milliseconds`,
    )
    console.log(BenchUtils.renderSegment(segment))
  }
})
