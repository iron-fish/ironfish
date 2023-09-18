/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { randomBytes } from 'crypto'
import Decimal from 'decimal.js'
import { createRootLogger } from '../logger'
import { MetricsMonitor } from '../metrics'
import { mempoolEntryComparator } from './memPool'
import { RecentlyEvictedCache } from './recentlyEvictedCache'

describe('RecentlyEvictedCache', () => {
  const logger = createRootLogger()
  /**
   * orderedTransactions[i] has feeRate = i, sequence = i
   */
  const orderedTransactions = [...new Array(20)].map((_, i) => {
    const hash = randomBytes(32)
    return {
      hash: hash,
      feeRate: new Decimal(i),
      sequence: i,
      hashAsString: hash.toString('hex'),
      maxAge: 5,
    }
  })

  const randomFeeRates = [
    58, 70, 88, 89, 54, 57, 26, 94, 34, 53, 35, 14, 19, 59, 4, 75, 3, 85, 19, 84,
  ]

  const randomSequences = [
    87, 80, 73, 72, 52, 42, 19, 61, 34, 20, 49, 22, 15, 96, 14, 9, 43, 39, 33, 10,
  ]

  const randomAges = [12, 13, 15, 17, 11, 1, 8, 14, 16, 3, 5, 7, 9, 18, 10, 4, 2, 20, 19, 6]

  const randomTransactions = [...new Array(20)].map((_, i) => {
    const hash = randomBytes(32)
    return {
      hash: hash,
      feeRate: new Decimal(randomFeeRates[i]),
      sequence: randomSequences[i],
      hashAsString: hash.toString('hex'),
      maxAge: randomAges[i],
    }
  })

  describe('add', () => {
    it('should not exceed maximum maxSize', () => {
      const testCache = new RecentlyEvictedCache({
        maxSize: 10,
        logger,
        metrics: new MetricsMonitor({ logger }),
        sortFunction: mempoolEntryComparator,
      })

      for (const { hash, feeRate, sequence, maxAge } of orderedTransactions) {
        testCache.add(hash, feeRate, sequence, maxAge)
      }

      expect(testCache.size()).toEqual(10)
    })

    it('should evict the proper transaction when full and a new transaction comes in [ORDERED]', () => {
      const testCache = new RecentlyEvictedCache({
        maxSize: 2,
        logger,
        metrics: new MetricsMonitor({ logger }),
        sortFunction: mempoolEntryComparator,
      })

      testCache.add(
        orderedTransactions[5].hash,
        orderedTransactions[5].feeRate,
        orderedTransactions[5].sequence,
        orderedTransactions[5].maxAge,
      )
      testCache.add(
        orderedTransactions[7].hash,
        orderedTransactions[7].feeRate,
        orderedTransactions[7].sequence,
        orderedTransactions[7].maxAge,
      )
      // cache: fees = [5, 7]

      // adding feeRate = 6 should evict feeRate = 7
      testCache.add(
        orderedTransactions[6].hash,
        orderedTransactions[6].feeRate,
        orderedTransactions[6].sequence,
        orderedTransactions[6].maxAge,
      )
      expect(testCache.has(orderedTransactions[7].hashAsString)).toEqual(false)
      expect(testCache.has(orderedTransactions[5].hashAsString)).toEqual(true)
      expect(testCache.has(orderedTransactions[6].hashAsString)).toEqual(true)

      // cache: fees = [5, 6]
      // adding feeRate = 4 should evict feeRate = 6
      testCache.add(
        orderedTransactions[4].hash,
        orderedTransactions[4].feeRate,
        orderedTransactions[4].sequence,
        orderedTransactions[4].maxAge,
      )
      expect(testCache.has(orderedTransactions[6].hashAsString)).toEqual(false)
      expect(testCache.has(orderedTransactions[5].hashAsString)).toEqual(true)
      expect(testCache.has(orderedTransactions[4].hashAsString)).toEqual(true)

      // cache: fees = [4, 5]
      // adding feeRate = 10 should not evict anything
      testCache.add(
        orderedTransactions[10].hash,
        orderedTransactions[10].feeRate,
        orderedTransactions[10].sequence,
        orderedTransactions[10].maxAge,
      )
      expect(testCache.has(orderedTransactions[10].hashAsString)).toEqual(false)
      expect(testCache.has(orderedTransactions[4].hashAsString)).toEqual(true)
      expect(testCache.has(orderedTransactions[5].hashAsString)).toEqual(true)
    })

    it('should evict the proper transaction when full and a new transaction comes in [RANDOM]', () => {
      const testCache = new RecentlyEvictedCache({
        maxSize: 5,
        logger,
        metrics: new MetricsMonitor({ logger }),
        sortFunction: mempoolEntryComparator,
      })

      const added: typeof randomTransactions = []
      for (const { hash, feeRate, sequence, hashAsString, maxAge } of randomTransactions) {
        testCache.add(hash, feeRate, sequence, maxAge)
        added.push({ hash, feeRate, sequence, hashAsString, maxAge })
        expect(testCache.size()).toEqual(Math.min(added.length, 5))

        const expected = added
          .sort((t1, t2) => Number(t1.feeRate.minus(t2.feeRate)))
          .slice(0, 5)

        for (const { hashAsString } of expected) {
          expect(testCache.has(hashAsString)).toEqual(true)
        }
      }
    })
  })

  describe('flush', () => {
    it('should flush transactions beyond the max age when a new block connects [ORDERED]', () => {
      const testCache = new RecentlyEvictedCache({
        logger,
        maxSize: 20,
        metrics: new MetricsMonitor({ logger }),
        sortFunction: mempoolEntryComparator,
      })

      for (const { hash, feeRate, sequence, maxAge } of orderedTransactions) {
        testCache.add(hash, feeRate, sequence, maxAge)
      }

      expect(testCache.size()).toEqual(20)

      /**
       * all txns with exiration blocks before this should be evicted
       */
      const minSequence = 10

      testCache.flush(minSequence)

      // only txns with expiration sequences after the min sequence should remain in the cache
      const expected = orderedTransactions.filter(
        ({ sequence, maxAge }) => sequence > minSequence - maxAge,
      )

      const notExpected = orderedTransactions.filter((t) => !expected.includes(t))

      for (const { hashAsString } of expected) {
        expect(testCache.has(hashAsString)).toBe(true)
      }

      for (const { hashAsString } of notExpected) {
        expect(testCache.has(hashAsString)).toBe(false)
      }
    })

    it('should flush transactions beyond the max age when a new block connects [RANDOM]', () => {
      const testCache = new RecentlyEvictedCache({
        logger,
        maxSize: 5,
        metrics: new MetricsMonitor({ logger }),
        sortFunction: mempoolEntryComparator,
      })

      const added: typeof randomTransactions = []

      // add the first 10 elements
      for (const { hash, feeRate, sequence, hashAsString, maxAge } of randomTransactions.slice(
        0,
        10,
      )) {
        testCache.add(hash, feeRate, sequence, maxAge)
        added.push({ hash, feeRate, sequence, hashAsString, maxAge })
      }

      /**
       * all txns with exiration blocks before this should be evicted
       */
      const minSequence = 30

      testCache.flush(minSequence)

      // only txns with expiration sequences after the min sequence should remain in the cache
      let expected = added
        .sort((t1, t2) => Number(t1.feeRate.minus(t2.feeRate)))
        .slice(0, 5)
        .filter(({ sequence, maxAge }) => sequence > minSequence - maxAge)

      let notExpected = added.filter((t) => !expected.includes(t))

      for (const { hashAsString } of expected) {
        expect(testCache.has(hashAsString)).toBe(true)
      }

      for (const { hashAsString } of notExpected) {
        expect(testCache.has(hashAsString)).toBe(false)
      }

      // add the next 10 elements
      for (const { hash, feeRate, sequence, hashAsString, maxAge } of randomTransactions.slice(
        10,
      )) {
        testCache.add(hash, feeRate, sequence, maxAge)
        added.push({ hash, feeRate, sequence, hashAsString, maxAge })
      }

      testCache.flush(minSequence)

      expected = added
        .sort((t1, t2) => Number(t1.feeRate.minus(t2.feeRate)))
        .slice(0, 5)
        .filter(({ sequence, maxAge }) => sequence > minSequence - maxAge)

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
