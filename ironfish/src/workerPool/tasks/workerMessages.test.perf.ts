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
    const { min, max, avg } = printResults('createMinersFeeRequest', runs, segment)

    expect(max).toBeLessThanOrEqual(1.191)
    expect(min).toBeLessThanOrEqual(0.029459)
    expect(avg).toBeLessThanOrEqual(0.06783)
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

    const { min, max, avg } = printResults('decryptNotes', runs, segment)

    expect(max).toBeLessThanOrEqual(6.1685)
    expect(min).toBeLessThanOrEqual(0.490597)
    expect(avg).toBeLessThanOrEqual(0.582932)
  })

  function printResults(
    testName: string,
    runs: number[],
    segment: SegmentResults,
  ): {
    min: number
    max: number
    avg: number
  } {
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

    return {
      min,
      max,
      avg: average,
    }
  }
})
