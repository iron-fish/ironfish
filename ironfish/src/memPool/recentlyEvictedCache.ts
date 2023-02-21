/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../assert'
import { createRootLogger, Logger } from '../logger'
import { MetricsMonitor } from '../metrics'
import { Transaction, TransactionHash } from '../primitives/transaction'
import { PriorityQueue } from './priorityQueue'

/**
 * An entry in the eviction queue.
 * Entries are sorted based on `feeRate` descending.
 */
interface EvictionEntry {
  hash: TransactionHash
  feeRate: bigint
}

/**
 * An entry in the insertedAt queue.
 * Entries are sorted based on the sequence when they were inserted.
 */
interface InsertedAtEntry {
  hash: TransactionHash
  insertedAtSequence: number
}

/**
 * A cache to track transactions that have recently been evicted from the mempool.
 *
 * This is primarily a mechanism to prevent transactions from being re-added to the mempool
 * within a reasonable duration if for some reason they are evicted (i.e. due to underpricing).
 *
 * This cache also performs a secondary feature of improving the performance of the mempool
 * by skipping validation for transactions that would not be accepted into the mempool.
 *
 * Transactions are routinely evicted from the cache after they have spent `maxJailTime` in the cache.
 * This is to prevent transactions from being permanently stuck in the cache.
 *
 * When full, transactions are evicted in order of `feeRate` descending to make room for the
 * new transaction. This order is chosen because these transactions most likely to be successfully
 * re-introduced into the mempool
 */
export class RecentlyEvictedCache {
  private readonly metrics: MetricsMonitor
  private readonly logger?: Logger

  /**
   * The default capacity of the cache. This is used if no capacity is provided in the constructor.
   *
   *  This value is determined based on the default size of the mempool.
   * If the size of the mempool is changed, the capacity of the cache should be adjusted accordingly.
   */
  private readonly defaultCapacity: number = 1000 // TODO: Set a proper default capacity

  private readonly defaultMaxJailTime: number = 10 // TODO: Set a proper default maximum jail time

  private readonly capacity: number
  private readonly maxJailTime: number

  /**
   * Maintains a set of all transaction hashes in the cache
   */
  private readonly transactions = new Set<TransactionHash>()

  /**
   * Tracks the sequence number of the last block added to the chain.
   * This is used to determine when a transaction has spent `maxJailTime` in the cache.
   */
  private currentSequence = 0

  /**
   * A priority queue of transaction hashes ordered by `feeRate` descending.
   * This is the eviction order for the cache when full.
   */
  private readonly evictionQueue: PriorityQueue<EvictionEntry>

  /**
   * A priority queue of transaction hashes ordered by the sequence when they were inserted into the cache.
   */
  // TODO: this can just be a normal queue because if y is inserted after x, it cannot have a lower sequence #
  private readonly insertedAtQueue: PriorityQueue<InsertedAtEntry>

  /**
   * Creates a new RecentlyEvictedCache.
   * Transactions that are evicted from the mempool should be added here.
   *
   * @constructor
   * @param {number} options.capacity the maximum number of hashes to store in the cache
   * @param {number} options.maxJailTime the maximum number of blocks a hash can spend in the cache
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
   * Removes the hash from the cache and eviction + insertion queues
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

    // keep the items in the two priority queues consistently in sync
    this.insertedAtQueue.remove(hash.toString('hex'))
    this.evictionQueue.remove(hash.toString('hex'))

    return true
  }

  /**
   * Pops the transaction with the highest fee rate from the cache.
   *
   * The eviction and insertion queues will still be in sync after calling this method.
   *
   * @returns the transaction hash that was evicted, or undefined if the cache is empty
   */
  private poll(): TransactionHash | undefined {
    const toEvict = this.evictionQueue.poll()

    if (!toEvict) {
      return
    }

    const hashToRemove = toEvict.hash

    this.remove(hashToRemove)

    return hashToRemove
  }

  /**
   * @returns the number of transactions in the cache
   */
  count(): number {
    return this.transactions.size
  }

  /**
   * @returns true if the cache is full, false otherwise
   */
  isFull(): boolean {
    return this.count() >= this.capacity
  }

  /**
   * @returns true if the cache is empty, false otherwise
   */
  isEmpty(): boolean {
    return this.count() === 0
  }

  /**
   * Adds a new transaction to the recently evicted cache.
   * If the cache is full, the transaction with the highest fee rate will be evicted.
   *
   * Note that the cache is resized after the transaction is added. Thus, if the new transaction
   * has the highest fee rate in the cache, then it will immediately be evicted.
   */
  add(transaction: Transaction): void {
    const hash = transaction.hash()

    if (this.has(hash)) {
      // add to metrics that a duplicate was attempted to be added
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
   * Sets the latest sequence.
   * This flushes the cache of any transactions that have expired
   */
  setSequence(sequence: number): void {
    this.currentSequence = sequence
    this.flush(sequence)
  }

  /**
   * Flushes the cache of any transactions have been present in beyond maximum jail time.
   * These transactions are now eligable for re-entry into the mempool.
   *
   * @param maxSequence the maximum sequence number that a transaction can have to be flushed
   */
  private flush(maxSequence: number): void {
    let flushCount = 0

    while (!this.isEmpty() && this.insertedAtQueue.size() > 0) {
      let toFlush = this.insertedAtQueue.peek()
      if (!toFlush || toFlush.insertedAtSequence + this.maxJailTime > maxSequence) {
        break
      }

      toFlush = this.insertedAtQueue.poll()
      // This element has been peeked so it should not be undefined
      Assert.isNotUndefined(toFlush)

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
