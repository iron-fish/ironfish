/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../assert'
import { createRootLogger, Logger } from '../logger'
import { MetricsMonitor } from '../metrics'
import { Transaction, TransactionHash } from '../primitives/transaction'
import { PriorityQueue } from './priorityQueue'

interface EvictionEntry {
  hash: TransactionHash
  feeRate: bigint
}

interface InsertedAtEntry {
  hash: TransactionHash
  insertedAtSequence: number
}

export class RecentlyEvictedCache {
  private readonly metrics: MetricsMonitor
  private readonly logger?: Logger

  private readonly defaultCapacity: number = 1000 // TODO: fix this default initialization
  private readonly defaultMaxJailTime: number = 10 // TODO: fix -> this is max duration txns exist in cache

  private readonly capacity: number
  private readonly maxJailTime: number

  private readonly transactions = new Set<TransactionHash>()

  private currentSequence = 0

  /**
   * A priority queue of transactions to evict from this cache when full.
   *
   * Transactions are evicted in order of `feeRate` descending because
   * they are most likely to be re-included into the mempool
   */
  private readonly evictionQueue: PriorityQueue<EvictionEntry>

  /**
   * A priority queue to track the order in which transactions were inserted into the cache.
   */
  // TODO: this can just be a normal queue because if y is inserted after x, it cannot have a lower sequence #
  private readonly insertedAtQueue: PriorityQueue<InsertedAtEntry>

  /**
   * Creates a new cache to track transactions that have recently been evicted.
   *
   * Transactions are routinely evicted from the cache after they have spent `maxJailTime` in the cache.
   *
   * When full, transactions are evicted in order of `feeRate` descending to
   * make room for the new transaction.
   * @param options
   */
  constructor(options: {
    metrics: MetricsMonitor
    logger?: Logger
    capacity?: number
    maxJailTime?: number
  }) {
    this.capacity = options.capacity || this.defaultCapacity
    this.maxJailTime = options.maxJailTime || this.defaultMaxJailTime

    const logger = options.logger || createRootLogger()

    this.metrics = options.metrics
    this.logger = logger.withTag('RecentlyEvictedCache')

    this.evictionQueue = new PriorityQueue<EvictionEntry>(
      (t1, t2) => t1.feeRate > t2.feeRate,
      (t) => t.hash.toString('hex'),
    )

    this.insertedAtQueue = new PriorityQueue<InsertedAtEntry>(
      (t1, t2) => t1.insertedAtSequence < t2.insertedAtSequence,
      (t) => t.hash.toString('hex'),
    )
  }

  /**
   * Remove the transaction from the cache and the eviction + insertion queues
   *
   * @param hash the hash of the transaction to remove
   * @returns true if the hash was removed, false if it was not present in the cache
   */
  private remove(hash: TransactionHash): boolean {
    const hashExists = this.has(hash)

    if (!hashExists) {
      return false
    }

    this.transactions.delete(hash)

    // keep the 2 helper queues consistently in sync
    this.insertedAtQueue.remove(hash.toString('hex'))
    this.evictionQueue.remove(hash.toString('hex'))

    return true
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
  private poll(): TransactionHash | undefined {
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

    this.remove(hashToRemove)

    return hashToRemove
  }

  count(): number {
    return this.transactions.size
  }

  isFull(): boolean {
    return this.count() >= this.capacity
  }

  isEmpty(): boolean {
    return this.count() === 0
  }

  /**
   * Adds a new transaction to the recently evicted cache.
   * If the cache is full, the transaction with the highest fee rate will be evicted.
   *
   * Note that the
   */
  add(transaction: Transaction): void {
    const hash = transaction.hash()

    if (this.has(hash)) {
      return
    }

    this.transactions.add(hash)
    this.evictionQueue.add({
      hash,
      feeRate: transaction.fee(),
    })

    this.insertedAtQueue.add({
      hash,
      insertedAtSequence: this.currentSequence,
    })

    if (this.isFull()) {
      this.poll()
    }

    return
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
    while (!this.isEmpty() && this.insertedAtQueue.size() > 0) {
      let toFlush = this.insertedAtQueue.peek()
      if (!toFlush || toFlush.insertedAtSequence + this.maxJailTime > this.currentSequence) {
        break
      }

      toFlush = this.insertedAtQueue.poll()
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

    // TODO: is there an easier way to clear these 2 pqs?
    while (this.evictionQueue.size() > 0) {
      this.evictionQueue.poll()
    }

    while (this.insertedAtQueue.size() > 0) {
      this.insertedAtQueue.poll()
    }
  }
}
