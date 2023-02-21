/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BufferMap } from 'buffer-map'
import { Assert } from '../assert'
import { createRootLogger, Logger } from '../logger'
import { MetricsMonitor } from '../metrics'
import { getTransactionSize } from '../network/utils/serializers'
import { Transaction, TransactionHash } from '../primitives/transaction'
import { PriorityQueue } from './priorityQueue'

interface EvictionEntry {
  hash: TransactionHash
  feeRate: bigint
}

interface ExpirationEntry {
  hash: TransactionHash
  expiration: number
}

export class RecentlyEvictedCache {
  private readonly metrics: MetricsMonitor
  private readonly logger?: Logger

  private readonly capacity: number = 1000 // TODO: fix this default initialization

  private readonly transactions = new BufferMap<Transaction>()
  /**
   * Keep track of number of bytes stored in the transaction map
   * */
  private transactionsBytes = 0

  private readonly maxJailTime: number = 10 // TODO: fix -> this is max duration txns exist in cache

  private currentSequence = 0

  /**
   * A priority queue of transactions to evict from this cache when full.
   *
   * Transactions are evicted in order of `feeRate` descending because
   * they are most likely to be re-included into the mempool
   */
  private readonly evictionQueue: PriorityQueue<EvictionEntry>

  private readonly expirationQueue: PriorityQueue<ExpirationEntry>

  /**
   * Creates a new cache to track transactions that have recently been evicted.
   * Transactions are routinely evicted from the cache after the `maxJailTime`.
   * When full, transactions are evicted in order of `feeRate` descending to
   * make room for the new transaction.
   * @param options
   */
  constructor(options: { metrics: MetricsMonitor; logger?: Logger }) {
    const logger = options.logger || createRootLogger()

    this.metrics = options.metrics
    this.logger = logger.withTag('RecentlyEvictedCache')

    this.evictionQueue = new PriorityQueue<EvictionEntry>(
      (t1, t2) => t1.feeRate > t2.feeRate,
      (t) => t.hash.toString('hex'),
    )

    this.expirationQueue = new PriorityQueue<ExpirationEntry>(
      (t1, t2) => t1.expiration < t2.expiration,
      (t) => t.hash.toString('hex'),
    )
  }

  private remove(hash: TransactionHash): Transaction | void {
    const transactionToRemove = this.get(hash)

    if (!transactionToRemove) {
      return
    }

    this.transactions.delete(hash)

    this.transactionsBytes -= getTransactionSize(transactionToRemove)

    return transactionToRemove
  }

  /**
   * Removes the transaction with the highest fee rate from the cache.
   *
   * If the transaction cache and eviction queue are out of sync, this method
   * lazily pops from the eviction queue until it finds a transaction that is
   * present in the cache
   *
   * @returns the transaction that was evicted, or undefined if the cache is empty
   */
  private poll(): Transaction | void {
    let hashToRemove: Buffer | undefined

    while (!this.isEmpty() && this.evictionQueue.size() > 0) {
      const toEvict = this.evictionQueue.poll()

      Assert.isNotUndefined(toEvict)

      // lazy deletion
      if (!this.has(toEvict.hash)) {
        continue
      }

      hashToRemove = toEvict.hash
      break
    }

    if (!hashToRemove) {
      return
    }

    return this.remove(hashToRemove)
  }

  count(): number {
    return this.transactions.size
  }

  isFull(): boolean {
    return this.count() === this.capacity
  }

  isEmpty(): boolean {
    return this.count() === 0
  }

  /**
   * Adds a new transaction to the recently evicted cache.
   * If the cache is full, the transaction with the highest fee rate will be evicted.
   *
   */
  add(transaction: Transaction): void {
    const hash = transaction.hash()

    if (this.has(hash)) {
      return
    }

    if (this.isFull()) {
      this.poll()
    }

    this.transactions.set(hash, transaction)
    this.evictionQueue.add({
      hash,
      feeRate: transaction.fee(),
    })

    this.expirationQueue.add({
      hash,
      expiration: this.currentSequence + this.maxJailTime,
    })

    this.transactionsBytes += getTransactionSize(transaction)

    return
  }

  get(hash: TransactionHash): Transaction | undefined {
    return this.transactions.get(hash)
  }

  has(hash: TransactionHash): boolean {
    return this.transactions.has(hash)
  }

  /**
   * Sets the latest sequence. This will flush the cache of any transactions that have expired
   */
  setSequence(sequence: number): void {
    this.currentSequence = sequence
    this.flush()
  }

  /**
   * Flushes the cache of any transactions that have exceeded the maximum jail time.
   * These transactions are now eligable for re-entry into the mempool.
   */
  private flush(): void {
    let flushCount = 0
    while (!this.isEmpty() && this.expirationQueue.size() > 0) {
      let toFlush = this.expirationQueue.peek()
      if (!toFlush || toFlush.expiration > this.currentSequence) {
        break
      }

      toFlush = this.expirationQueue.poll()
      Assert.isNotUndefined(toFlush)

      if (!this.has(toFlush.hash)) {
        continue
      }

      this.remove(toFlush.hash)
      flushCount++
    }

    this.logger?.info(
      `Flushed ${flushCount} transactions from RecentlyEvictedCache after block ${this.currentSequence} added`,
    )

    return
  }

  /**
   * Clears the cache and helper queues. The cache will be reset to the intiail state.
   */
  clear(): void {
    this.transactions.clear()
    this.transactionsBytes = 0

    // TODO: is there an easier way to clear these 2 pqs?
    while (this.evictionQueue.size() > 0) {
      this.evictionQueue.poll()
    }

    while (this.expirationQueue.size() > 0) {
      this.expirationQueue.poll()
    }
  }
}
