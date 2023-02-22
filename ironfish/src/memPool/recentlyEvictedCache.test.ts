/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { randomBytes } from 'crypto'
import { createRootLogger } from '../logger'
import { mockLogger } from '../testUtilities/mocks'
import { RecentlyEvictedCache } from './recentlyEvictedCache'

describe('RecentlyEvictedCache', () => {
  const logger = createRootLogger()

  const transactions = [...new Array(20)].map((_, i) => {
    const hash = randomBytes(32)
    return {
      hash: hash,
      feeRate: BigInt(i),
      sequence: i,
      hashAsString: hash.toString('hex'),
    }
  })

  const feeRates = [
    58, 70, 88, 89, 54, 57, 26, 94, 34, 53, 35, 14, 19, 59, 4, 75, 3, 85, 19, 84,
  ]

  const sequences = [
    87, 80, 73, 72, 52, 42, 19, 61, 34, 20, 49, 22, 15, 96, 14, 9, 43, 39, 33, 10,
  ]

  const randomTransactions = [...new Array(20)].map((_, i) => {
    const hash = randomBytes(32)
    return {
      hash: hash,
      feeRate: BigInt(feeRates[i]),
      sequence: sequences[i],
      hashAsString: hash.toString('hex'),
    }
  })

  describe('add', () => {
    it('should not exceed maximum capacity', () => {
      const testCache = new RecentlyEvictedCache({
        capacity: 10,
        logger,
      })

      for (const transaction of transactions) {
        testCache.add(transaction.hash, transaction.feeRate, transaction.sequence)
      }

      expect(testCache.size()).toEqual(10)
    })

    it('should evict proper txn when full and new txn comes in', () => {
      const testCache = new RecentlyEvictedCache({
        capacity: 2,
        logger,
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

    it('should evict proper txn when full and new txn comes in [RANDOM]', () => {
      const testCache = new RecentlyEvictedCache({
        capacity: 5,
        logger,
      })

      const added: typeof randomTransactions = []
      for (const { hash, feeRate, sequence, hashAsString } of randomTransactions) {
        testCache.add(hash, feeRate, sequence)
        added.push({ hash, feeRate, sequence, hashAsString })
        expect(testCache.size()).toEqual(Math.min(added.length, 5))

        const expected = added.sort((t1, t2) => Number(t1.feeRate - t2.feeRate)).slice(0, 5)

        for (const { hashAsString } of expected) {
          expect(testCache.has(hashAsString)).toEqual(true)
        }
      }
    })
  })

  describe('flush', () => {
    // transactions[i] has fee rate [i]
    const transactions = [...new Array(10)].map((_, i) => {
      const hash = randomBytes(32)
      return { hash, feeRate: BigInt(i), sequence: i, hashAsString: hash.toString('hex') }
    })

    it('should flush if new block connects that pushes out old transactions', () => {
      const testCache = new RecentlyEvictedCache({
        capacity: 20,
        logger,
      })

      for (const { hash, feeRate, sequence } of transactions) {
        testCache.add(hash, feeRate, sequence)
      }

      expect(testCache.size()).toEqual(10)

      testCache.flush(5)

      expect(testCache.size()).toEqual(5)

      for (const { hashAsString } of transactions.filter(({ sequence }) => sequence < 5)) {
        expect(testCache.has(hashAsString)).toBe(false)
      }

      for (const { hashAsString } of transactions.filter(({ sequence }) => sequence >= 5)) {
        expect(testCache.has(hashAsString)).toBe(true)
      }
    })

    it('should flush if new block connects that pushes out old transactions [RANDOM]', () => {
      const testCache = new RecentlyEvictedCache({
        capacity: 5,
        logger,
      })

      const added: typeof randomTransactions = []
      for (const { hash, feeRate, sequence, hashAsString } of randomTransactions.slice(0, 10)) {
        testCache.add(hash, feeRate, sequence)
        added.push({ hash, feeRate, sequence, hashAsString })
      }

      testCache.flush(30)

      let expected = added
        .sort((t1, t2) => Number(t1.feeRate - t2.feeRate))
        .slice(0, 5)
        .filter(({ sequence }) => sequence > 30)

      let notExpected = added.filter((t) => !expected.includes(t))

      for (const { hashAsString } of expected) {
        expect(testCache.has(hashAsString)).toBe(true)
      }

      for (const { hashAsString } of notExpected) {
        expect(testCache.has(hashAsString)).toBe(false)
      }

      for (const { hash, feeRate, sequence, hashAsString } of randomTransactions.slice(10)) {
        testCache.add(hash, feeRate, sequence)
        added.push({ hash, feeRate, sequence, hashAsString })
      }

      testCache.flush(35)

      expected = added
        .sort((t1, t2) => Number(t1.feeRate - t2.feeRate))
        .slice(0, 5)
        .filter(({ sequence }) => sequence > 35)

      notExpected = added.filter((t) => !expected.includes(t))

      for (const { hashAsString } of expected) {
        expect(testCache.has(hashAsString)).toBe(true)
      }

      for (const { hashAsString } of notExpected) {
        expect(testCache.has(hashAsString)).toBe(false)
      }
    })
  })
})
