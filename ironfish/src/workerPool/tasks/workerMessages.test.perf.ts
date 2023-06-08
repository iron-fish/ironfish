/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable no-console */

import { Assert } from '../../assert'
import {
  createNodeTest,
  useAccountFixture,
  useBlockWithTxs,
  writeTestReport,
} from '../../testUtilities'
import { BenchUtils, CurrencyUtils, PromiseUtils, SegmentResults } from '../../utils'
import { Account } from '../../wallet'
import { WorkerPool } from '../pool'
import { CreateMinersFeeRequest } from './createMinersFee'
import { DecryptNoteOptions, DecryptNotesRequest } from './decryptNotes'
import { WORKER_MESSAGE_HEADER_SIZE } from './workerMessage'

// TODO: Move into a separate file
describe.only('DecryptNotes job', () => {
  const jestConsole = console

  beforeAll(() => {
    global.console = require('console')
  })

  afterAll(() => {
    global.console = jestConsole
  })
  const nodeTest = createNodeTest(true)

  const TRANSACTIONS = 50

  const NOTES = [20, 100]
  const CAN_DECRYPT_AS_OWNER = [true, false]
  const TRY_DECRYPT_AS_SPENDER = [true, false]

  it('decryptsNotes', async () => {
    const account = await useAccountFixture(nodeTest.wallet, 'account')
    const account2 = await useAccountFixture(nodeTest.wallet, 'account2')

    const { block, transactions } = await useBlockWithTxs(nodeTest.node, TRANSACTIONS, account)
    await expect(nodeTest.chain).toAddBlock(block)

    const payload1: DecryptNoteOptions = {
      incomingViewKey: account.incomingViewKey,
      outgoingViewKey: account.outgoingViewKey,
      viewKey: account.viewKey,
      decryptForSpender: true,
      notes: [],
    }
    const payload2: DecryptNoteOptions = {
      incomingViewKey: account2.incomingViewKey,
      outgoingViewKey: account2.outgoingViewKey,
      viewKey: account2.viewKey,
      decryptForSpender: true,
      notes: [],
    }
    const notesToDecrypt: DecryptNoteOptions['notes'] = []
    let i = 0
    for (const transaction of transactions) {
      for (const note of transaction.notes) {
        notesToDecrypt.push({
          serializedNote: note.serialize(),
          currentNoteIndex: i++,
        })
      }
    }

    // Generate test permutations
    const TESTS: {
      notes: number
      canDecryptAsOwner: boolean
      tryDecryptForSpender: boolean
    }[] = []
    for (const notes of NOTES) {
      for (const canDecryptAsOwner of CAN_DECRYPT_AS_OWNER) {
        for (const tryDecryptForSpender of TRY_DECRYPT_AS_SPENDER) {
          TESTS.push({
            notes,
            canDecryptAsOwner,
            tryDecryptForSpender,
          })
        }
      }
    }

    for (const test of TESTS) {
      const payload = test.canDecryptAsOwner ? payload1 : payload2
      payload.decryptForSpender = test.tryDecryptForSpender
      payload.notes = notesToDecrypt.slice(0, test.notes)

      const tsPool = new WorkerPool({ numWorkers: 1 })
      tsPool.start()

      const results = await BenchUtils.withSegmentIterations(10, 100, async () => {
        const _x = await tsPool.decryptNotes(payload)
      })

      const title = `[DecryptNotes: notes: ${
        test.notes
      }, canDecrypt: ${test.canDecryptAsOwner.toString()}, decryptForSpender: ${test.tryDecryptForSpender.toString()}]`
      console.log(BenchUtils.renderSegmentAggregate(results, title))

      await tsPool.stop()
    }
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

    writeTestReport(
      new Map([
        ['elapsed', `${total}`],
        ['fastestruntime', `${min}`],
        ['slowestruntime', `${max}`],
        ['averageruntime', `${average}`],
        ['timespan', `${segment.time}`],
        ['rss', `${segment.rss}`],
        ['mem', `${segment.mem}`],
        ['heap', `${segment.heap}`],
      ]),
      new Map([
        ['Total elapsed', `${total} milliseconds`],
        ['Fastest runtime', `${min} milliseconds`],
        ['Slowest runtime', `${max} milliseconds`],
        ['Average runtime', `${average} milliseconds`],
      ]),
      `Message: ${testName}, Iterations: ${TEST_ITERATIONS}`,
    )
    console.info(BenchUtils.renderSegment(segment))
  }
})
