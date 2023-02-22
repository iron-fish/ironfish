/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Logger } from '../logger'
import { TransactionHash } from '../primitives/transaction'
import { PriorityQueue } from './priorityQueue'

interface EvictionEntry {
  hash: TransactionHash
  feeRate: bigint
}

interface InsertedAtEntry {
  hash: TransactionHash
  insertedAtSequence: number
}

/**
 * A cache to track transactions that have recently been evicted from the mempool.
 *
 * This is primarily a mechanism to prevent transactions from being re-added to the mempool
 * within a reasonable duration if for some reason they are evicted (i.e. the mempool is full
 * and the transaction is underpriced).
 *
 * When full, transactions are evicted in order of `feeRate` descending to make room for the
 * new transaction. This order is chosen because these transactions most likely to be successfully
 * re-introduced into the mempool
 */
export class RecentlyEvictedCache {
  private readonly logger?: Logger

  /**
   * The maximum capacity of the cache in number of transactions.
   */
  private readonly capacity: number

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
  constructor(options: { logger: Logger; capacity: number }) {
    this.capacity = options.capacity

    const logger = options.logger

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
    const stringHash = hash.toString('hex')

    if (!this.has(stringHash)) {
      return false
    }

    // keep the items in the two priority queues consistently in sync
    this.insertedAtQueue.remove(stringHash)
    this.evictionQueue.remove(stringHash)

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
  size(): number {
    return this.insertedAtQueue.size()
  }

  /**
   * Adds a new transaction to the recently evicted cache.
   * If the cache is full, the transaction with the highest fee rate will be evicted.
   *
   * Note that the cache is resized after the transaction is added. Thus, if the new transaction
   * has the highest fee rate in the cache, then it will immediately be evicted.
   */
  add(
    transactionHash: TransactionHash,
    feeRate: bigint,
    currentBlockSequence: number,
  ): boolean {
    if (this.has(transactionHash.toString('hex'))) {
      // add to metrics that a duplicate was attempted to be added
      return false
    }

    this.evictionQueue.add({
      hash: transactionHash,
      feeRate,
    })

    this.insertedAtQueue.add({
      hash: transactionHash,
      insertedAtSequence: currentBlockSequence,
    })

    while (this.size() > this.capacity) {
      this.poll()
    }

    return true
  }

  has(hash: string): boolean {
    return this.insertedAtQueue.has(hash)
  }

  /**
   * Flushes the cache of any transactions have were added before minSequence
   *
   * @param minSequence all transactions added before this sequence will be flushed
   */
  flush(minSequence: number): void {
    let flushCount = 0

    let toFlush = this.insertedAtQueue.peek()
    while (toFlush && toFlush.insertedAtSequence < minSequence) {
      this.remove(toFlush.hash)
      flushCount++
      toFlush = this.insertedAtQueue.peek()
    }

    this.logger?.debug(
      `Flushed ${flushCount} transactions from RecentlyEvictedCache added before block ${minSequence}`,
    )

    return
  }
}
