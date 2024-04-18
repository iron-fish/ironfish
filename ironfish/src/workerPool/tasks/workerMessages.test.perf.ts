/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable no-console */

import { Assert } from '../../assert'
import { TransactionVersion } from '../../primitives/transaction'
import {
  createNodeTest,
  useAccountFixture,
  useBlockWithTxs,
  writeTestReport,
} from '../../testUtilities'
import { BenchUtils, CurrencyUtils, PromiseUtils, SegmentResults } from '../../utils'
import { SpendingAccount } from '../../wallet'
import { CreateMinersFeeRequest } from './createMinersFee'
import { DecryptNoteOptions, DecryptNotesRequest } from './decryptNotes'
import { WORKER_MESSAGE_HEADER_SIZE } from './workerMessage'

describe('WorkerMessages', () => {
  const nodeTest = createNodeTest(true)

  const TEST_ITERATIONS = 50

  let account: SpendingAccount

  beforeAll(async () => {
    account = await useAccountFixture(nodeTest.wallet, 'account')
  })

  it('createMinersFeeRequest', async () => {
    Assert.isNotNull(account.spendingKey)
    const message = new CreateMinersFeeRequest(
      CurrencyUtils.decodeIron(20),
      Buffer.from('hello world memo'),
      account.spendingKey,
      TransactionVersion.V1,
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
          accountId: account.id,
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
