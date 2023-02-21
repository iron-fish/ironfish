/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { randomBytes } from 'crypto'
import { mockLogger } from '../testUtilities/mocks'
import { PriorityQueue } from './priorityQueue'
import { RecentlyEvictedCache } from './recentlyEvictedCache'

function* consume<T>(queue: PriorityQueue<T>): Generator<T, void, unknown> {
  const clone = queue.clone()

  while (clone.size() > 0) {
    const item = clone.poll()

    if (item === undefined) {
      continue
    }

    yield item
  }
}

describe('RecentlyEvictedCache', () => {
  describe('add', () => {
    // transactions[i] has fee rate = i and sequence = i
    const transactions = [...new Array(21)].map((_, i) => {
      const hash = randomBytes(32)
      return { hash: hash, feeRate: BigInt(i), sequence: i, hashAsString: hash.toString('hex') }
    })

    it('should not exceed maximum capacity', () => {
      const testCache = new RecentlyEvictedCache({
        logger: mockLogger(),
        capacity: 10,
        maxJailTime: 10,
      })

      for (const transaction of transactions) {
        testCache.add(transaction.hash, transaction.feeRate, transaction.sequence)
      }

      expect(testCache.size()).toEqual(10)
    })

    it('should evict proper txn when full and new txn comes in', () => {
      const testCache = new RecentlyEvictedCache({
        logger: mockLogger(),
        capacity: 2,
        maxJailTime: 10,
      })

      testCache.add(transactions[5].hash, transactions[5].feeRate, transactions[5].sequence)
      testCache.add(transactions[7].hash, transactions[7].feeRate, transactions[7].sequence)
      // cache: fees = [5, 7]

      // adding feeRate = 6 should evict feeRate = 7
      testCache.add(transactions[6].hash, transactions[6].feeRate, transactions[6].sequence)
      expect(testCache.has(transactions[7].hashAsString)).toEqual(false)
      expect(testCache.has(transactions[5].hashAsString)).toEqual(true)
      expect(testCache.has(transactions[6].hashAsString)).toEqual(true)

      // cache: fees = [5, 6]
      // adding feeRate = 4 should evict feeRate = 6
      testCache.add(transactions[4].hash, transactions[4].feeRate, transactions[4].sequence)
      expect(testCache.has(transactions[6].hashAsString)).toEqual(false)
      expect(testCache.has(transactions[5].hashAsString)).toEqual(true)
      expect(testCache.has(transactions[4].hashAsString)).toEqual(true)

      // cache: fees = [4, 5]
      // adding feeRate = 10 should not evict anything
      testCache.add(transactions[10].hash, transactions[10].feeRate, transactions[10].sequence)
      expect(testCache.has(transactions[10].hashAsString)).toEqual(false)
      expect(testCache.has(transactions[4].hashAsString)).toEqual(true)
      expect(testCache.has(transactions[5].hashAsString)).toEqual(true)
    })
  })

  describe('flush', () => {
    // transactions[i] has fee rate [i]
    const transactions = [...new Array(10)].map((_, i) => {
      const hash = randomBytes(32)
      return { hash: hash, feeRate: BigInt(i), sequence: i, hashAsString: hash.toString('hex') }
    })
    it('should flush if new block connects that pushes out old transactions', () => {
      const testCache = new RecentlyEvictedCache({
        logger: mockLogger(),
        capacity: 20,
        maxJailTime: 5,
      })

      for (let i = 0; i < transactions.length; ++i) {
        testCache.add(transactions[i].hash, transactions[i].feeRate, transactions[i].sequence)
      }
      expect(testCache.size()).toEqual(10)
      let clone = testCache['evictionQueue'].clone()
      while (clone.size()) {
        const next = clone.poll()
        next && console.log(next.hash.toString('hex'), next.feeRate)
      }
      // remove all transactions with sequence + max jail time < 5
      testCache.flush(10)
      clone = testCache['evictionQueue'].clone()
      while (clone.size()) {
        const next = clone.poll()
        next && console.log(next.hash.toString('hex'), next.feeRate)
      }
      expect(testCache.size()).toEqual(4)
    })
  })

  describe('helper methods', () => {
    it('has', () => {
      expect(true).toEqual(true)
    })
    it('isEmpty', () => {
      expect(true).toEqual(true)
    })
    it('isFull', () => {
      expect(true).toEqual(true)
    })
    it('size', () => {
      expect(true).toEqual(true)
    })
  })

  /*
  add
  - don't go over max capacity
  - should evict proper txn when full and new txn comes in
  flush
  - should flush if new block connects that pushes out old transactions
  helper methods
  */
})
