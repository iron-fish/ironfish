/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable no-console */

import { Assert } from '../../assert'
import { createNodeTest, useAccountFixture, useBlockWithTxs } from '../../testUtilities'
import { BenchUtils, CurrencyUtils, PromiseUtils, SegmentResults } from '../../utils'
import { Account } from '../../wallet'
import { CreateMinersFeeRequest } from './createMinersFee'
import { DecryptNoteOptions, DecryptNotesRequest } from './decryptNotes'
import { WORKER_MESSAGE_HEADER_SIZE } from './workerMessage'

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

    const payload: DecryptNoteOptions[] = []
    for (const transaction of transactions) {
      for (const note of transaction.notes) {
        payload.push({
          serializedNote: note.serialize(),
          incomingViewKey: account.incomingViewKey,
          outgoingViewKey: account.outgoingViewKey,
          viewKey: account.viewKey,
          currentNoteIndex: 0,
          decryptForSpender: true,
        })
      }
    }

    expect(payload.length).toEqual(100)

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

    if (process.env.GENERATE_TEST_REPORT) {
      console.log(
        `Total time: ${total},` +
          `Fastest runtime: ${min},` +
          `Slowest runtime: ${max},` +
          `Average runtime: ${average},` +
          BenchUtils.renderSegment(segment, ''),
      )
    } else {
      console.info(
        `[TEST RESULTS: Message: ${testName}, Iterations: ${TEST_ITERATIONS}]` +
          `\nTotal elapsed: ${total} milliseconds` +
          `\nFastest: ${min} milliseconds` +
          `\nSlowest: ${max} milliseconds` +
          `\nAverage: ${average} milliseconds`,
      )
      console.info(BenchUtils.renderSegment(segment))
    }
  }
})
