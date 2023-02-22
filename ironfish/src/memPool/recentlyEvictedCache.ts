/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Logger } from '../logger'
import { TransactionHash } from '../primitives/transaction'
import { PriorityQueue } from './priorityQueue'

interface EvictionQueueEntry {
  hash: TransactionHash
  feeRate: bigint
}

interface ExpireAtQueueEntry {
  hash: TransactionHash
  expireAtSequence: number
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
  private readonly evictionQueue: PriorityQueue<EvictionQueueEntry>

  /**
   * A priority queue of transaction hashes ordered by their expiration sequence.
   */
  // TODO: this can just be a normal queue because if y is inserted after x, y cannot expire before x
  private readonly expireAtQueue: PriorityQueue<ExpireAtQueueEntry>

  /**
   * Creates a new RecentlyEvictedCache.
   * Transactions that are evicted from the mempool should be added here.
   *
   * @constructor
   * @param options.capacity the maximum number of hashes to store in the cache
   */
  constructor(options: { logger: Logger; capacity: number }) {
    this.capacity = options.capacity

    const logger = options.logger

    this.logger = logger.withTag('RecentlyEvictedCache')

    this.evictionQueue = new PriorityQueue<EvictionQueueEntry>(
      (t1, t2) => t1.feeRate > t2.feeRate,
      (t) => t.hash.toString('hex'),
    )

    this.expireAtQueue = new PriorityQueue<ExpireAtQueueEntry>(
      (t1, t2) => t1.expireAtSequence < t2.expireAtSequence,
      (t) => t.hash.toString('hex'),
    )
  }

  /**
   * Removes the hash from the cache and eviction + insertion queues
   *
   * @param hash the hash of the transaction to remove
   *
   * @returns true if the hash was removed, false if it was not present in the cache
   */
  private remove(hash: TransactionHash): boolean {
    const stringHash = hash.toString('hex')
    if (!this.has(stringHash)) {
      return false
    }

    // keep the items in the two priority queues consistently in sync
    this.expireAtQueue.remove(stringHash)
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
    return this.expireAtQueue.size()
  }

  /**
   * Adds a new transaction to the recently evicted cache.
   * If the cache is full, the transaction with the highest fee rate will be evicted.
   *
   * Note that the cache is resized after the transaction is added. Thus, if the new transaction
   * has the highest fee rate in the cache, then it will immediately be evicted.
   *
   * @param transactionHash The hash of the transaction to add
   * @param feeRate the fee/byte rate of the transaction
   * @param currentBlockSequence the current block sequence when the transaction was added
   * @param maxAge The maximum duration, in number of blocks, the transaction can stay in the cache
   *
   * @returns true if the transaction was successfully added to the cache, false if it was already present
   */
  add(
    transactionHash: TransactionHash,
    feeRate: bigint,
    currentBlockSequence: number,
    maxAge: number,
  ): boolean {
    if (this.has(transactionHash.toString('hex'))) {
      // add to metrics that a duplicate was attempted to be added
      return false
    }

    this.evictionQueue.add({
      hash: transactionHash,
      feeRate,
    })

    this.expireAtQueue.add({
      hash: transactionHash,
      expireAtSequence: currentBlockSequence + maxAge,
    })

    // keep the cache under max capacity
    while (this.size() > this.capacity) {
      this.poll()
    }

    return true
  }

  /**
   * Checks if the cache contains a transaction with the given hash.
   *
   * @returns true if the hash exists in the cache
   */
  has(hash: string): boolean {
    return this.expireAtQueue.has(hash)
  }

  /**
   * Flushes the cache of any transactions that will expire after adding the given block sequence.
   *
   * @param maxSequence All transactions with an expiration sequence <= `maxSequence` will be flushed.
   */
  flush(maxSequence: number): void {
    let flushCount = 0

    let toFlush = this.expireAtQueue.peek()
    while (toFlush && toFlush.expireAtSequence <= maxSequence) {
      this.remove(toFlush.hash)
      flushCount++
      toFlush = this.expireAtQueue.peek()
    }

    this.logger?.debug(
      `Flushed ${flushCount} transactions from RecentlyEvictedCache after adding block ${maxSequence}`,
    )

    return
  }
}
