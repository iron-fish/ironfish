/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

declare module 'bfilter' {
  enum BloomFilterFlags {
    /**
     * Never update the filter with outpoints.
     */
    NONE = 'NONE',

    /**
     * Always update the filter with outpoints.
     */
    ALL = 'ALL',

    /**
     * Only update the filter with outpoints if it is
     * "asymmetric" in terms of addresses (pubkey/multisig).
     */
    PUBKEY_ONLY = 'PUBKEY_ONLY',
  }

  export class BloomFilter {
    /**
     * Create a bloom filter.
     * @param size Filter size in bits.
     * @param n Number of hash functions.
     * @param tweak Seed value.
     * @param update Update type.
     */
    constructor(size: number, n: number, tweak: number, update: BloomFilterFlags)

    /**
     * Inject properties from options.
     * @param size Filter size in bits.
     * @param n Number of hash functions.
     * @param tweak Seed value.
     * @param update Update type.
     */
    private fromOptions(size: number, n: number, tweak: number, update: BloomFilterFlags)

    /**
     * Instantiate bloom filter from options.
     * @param size Filter size in bits.
     * @param n Number of hash functions.
     * @param tweak Seed value.
     * @param update Update type.
     */
    static fromOptions(
      size: number,
      n: number,
      tweak: number,
      update: BloomFilterFlags,
    ): BloomFilter

    /**
     * Perform the murmur3 hash on data.
     * @param value value
     * @param n seed
     */
    hash(value: Buffer, n: number): number

    /**
     * Reset the filter.
     */
    reset(): void

    /**
     * Add data to the filter.
     */
    add(value: Buffer): void
    add(value: string, enc: BufferEncoding): void

    /**
     * Test whether data is present in the filter.
     */
    test(value: Buffer): boolean
    test(value: string, enc: BufferEncoding): boolean

    /**
     * Test whether data is present in the filter and potentially add data.
     */
    added(value: Buffer): boolean
    added(value: string, enc: BufferEncoding): boolean

    /**
     * Create a filter from a false positive rate.
     * @param items Expected number of items.
     * @param rate False positive rate (0.0-1.0).
     * @param update update
     */
    static fromRate(items: number, rate: number, update: number | string): BloomFilter

    /**
     * Ensure the filter is within the size limits.
     */
    isWithinConstraints(): boolean

    /**
     * Get serialization size.
     */
    getSize(): number

    /**
     * Write filter to buffer writer.
     */
    write(bw: unknown): unknown

    /**
     * Inject properties from buffer reader.
     */
    private read(br: unknown): BloomFilter
  }

  export class RollingFilter {
    /**
     * Create a rolling bloom filter.
     * @param items Expected number of items.
     * @param rate False positive rate (0.0-1.0).
     */
    constructor(items: number, rate: number)

    /**
     * Inject properties from items and FPR.
     * @param items Expected number of items.
     * @param rate False positive rate (0.0-1.0).
     */
    private fromRate(items: number, rate: number): RollingFilter

    /**
     * Instantiate rolling filter from items and FPR.
     * @param items Expected number of items.
     * @param rate False positive rate (0.0-1.0).
     */
    static fromRate(items: number, rate: number): RollingFilter

    /**
     * Perform the murmur3 hash on data.
     * @param value value
     * @param n seed
     */
    hash(value: Buffer, n: number): number

    /**
     * Reset the filter.
     */
    reset(): void

    /**
     * Add data to the filter.
     */
    add(value: Buffer): void
    add(value: string, enc: BufferEncoding): void

    /**
     * Test whether data is present in the filter.
     */
    test(value: Buffer): boolean
    test(value: string, enc: BufferEncoding): boolean

    /**
     * Test whether data is present in the filter and potentially add data.
     */
    added(value: Buffer): boolean
    added(value: string, enc: BufferEncoding): boolean
  }
}
