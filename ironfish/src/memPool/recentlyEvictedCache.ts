/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import Decimal from 'decimal.js'
import { Logger } from '../logger'
import { MetricsMonitor } from '../metrics'
import { TransactionHash } from '../primitives/transaction'
import { PriorityQueue } from '../utils'

interface EvictionQueueEntry {
  hash: TransactionHash
  feeRate: Decimal
}

interface RemoveAtSequenceQueueEntry {
  hash: TransactionHash
  removeAtSequence: number
}

/**
 * A cache to track transactions that have recently been evicted from the mempool.
 *
 * This is primarily a mechanism to prevent transactions from being re-added to the mempool
 * within a reasonable duration if for some reason they are evicted (i.e. the mempool is full
 * and the transaction is underpriced).
 *
 * When the cache is full, the transaction with the highest fee rate is removed to make room
 * for the new transaction. This transaction is most likely to be re-introduced into the mempool,
 * so by removing it, we allow it to be re-fetched.
 */
export class RecentlyEvictedCache {
  private readonly logger: Logger

  private readonly metrics: MetricsMonitor

  /**
   * The maximum size of the cache in number of transactions.
   */
  public readonly maxSize: number

  /**
   * A priority queue of transaction hashes ordered by `feeRate` descending.
   * This is the eviction order for the cache when full.
   */
  private readonly evictionQueue: PriorityQueue<EvictionQueueEntry>

  /**
   * A priority queue of transaction hashes ordered by their sequence # when they should be
   * removed from the recently evicted cache.
   */
  // TODO(holahula): this can just be a normal queue because if y is inserted after x, y cannot expire before x
  private readonly removeAtSequenceQueue: PriorityQueue<RemoveAtSequenceQueueEntry>

  /**
   * Creates a new RecentlyEvictedCache.
   * Transactions that are evicted from the mempool should be added here.
   *
   * @constructor
   * @param options.maxSize the maximum number of hashes to store in the cache
   */
  constructor(options: {
    logger: Logger
    metrics: MetricsMonitor
    maxSize: number
    sortFunction: (t1: EvictionQueueEntry, t2: EvictionQueueEntry) => boolean
  }) {
    this.maxSize = options.maxSize
    this.metrics = options.metrics
    this.logger = options.logger.withTag('RecentlyEvictedCache')

    this.metrics.memPool_RecentlyEvictedCache_MaxSize.value = this.maxSize

    this.evictionQueue = new PriorityQueue<EvictionQueueEntry>(options.sortFunction, (t) =>
      t.hash.toString('hex'),
    )

    this.removeAtSequenceQueue = new PriorityQueue<RemoveAtSequenceQueueEntry>(
      (t1, t2) => t1.removeAtSequence < t2.removeAtSequence,
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
    this.removeAtSequenceQueue.remove(stringHash)
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
    return this.removeAtSequenceQueue.size()
  }

  /**
   *
   * @returns the usage of the recently evicted cache
   */
  saturation(): number {
    return this.size() / this.maxSize
  }

  /**
   * Adds a new transaction to the recently evicted cache.
   * If the cache is full, the transaction with the highest fee rate will be evicted.
   *
   * Note that the cache is resized after the transaction is added. Thus, if the cache is above capacity
   * and the new transaction has the highest fee rate in the cache, it will be immediately be evicted.
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
    feeRate: Decimal,
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

    this.removeAtSequenceQueue.add({
      hash: transactionHash,
      removeAtSequence: currentBlockSequence + maxAge,
    })

    // keep the cache under max capacity
    while (this.size() > this.maxSize) {
      this.poll()
    }

    this.updateMetrics()

    return true
  }

  /**
   * Checks if the cache contains a transaction with the given hash.
   *
   * @returns true if the hash exists in the cache
   */
  has(hash: string): boolean {
    return this.removeAtSequenceQueue.has(hash)
  }

  /**
   * Flushes the cache of any transactions that will expire after adding the given block sequence.
   *
   * @param sequence All transactions with an expiration sequence <= `sequence` will be flushed.
   */
  flush(sequence: number): void {
    let flushCount = 0

    let toFlush = this.removeAtSequenceQueue.peek()
    while (toFlush && toFlush.removeAtSequence <= sequence) {
      this.remove(toFlush.hash)
      flushCount++
      toFlush = this.removeAtSequenceQueue.peek()
    }

    if (flushCount !== 0) {
      this.logger.debug(
        `Flushed ${flushCount} transactions from RecentlyEvictedCache after adding block ${sequence}`,
      )
    }

    this.updateMetrics()

    return
  }

  /**
   * Updates the metrics for the cache. This should be called whenever the cache is modified.
   */
  private updateMetrics(): void {
    this.metrics.memPool_RecentlyEvictedCache_Size.value = this.size()
    this.metrics.memPool_RecentlyEvictedCache_Saturation.value = Math.round(
      this.saturation() * 100,
    )
  }
}
