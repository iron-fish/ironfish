/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

function isPowerOf2(n: number): boolean {
  // This checks that n is non-zero, and that n and n-1 have no bits in common
  // (taken from https://stackoverflow.com/a/30924333)
  return !!(n && !(n & (n - 1)))
}

/**
 * Simple implementation of a bloom filter. This is a set-like data structure
 * that can be used to check whether certain items may or may not be present in
 * the set. This is a probabilistic data structure that does not return false
 * negatives, but may return false positives.
 *
 * Usually, bloom filters work by computing the hash of each item added to the
 * set. This implementation differs in that it does not compute any hash for
 * efficiency, and instead assumes that each item contains random data. Items
 * that share the same prefix will result in collisions/false positives.
 */
export class BloomFilter {
  private readonly bitMask: number
  private readonly bitArray: Buffer

  constructor(bits: number) {
    if (bits < 8) {
      // Need to have at least 1 byte
      throw new Error(`bits must be at least 8 (got ${bits})`)
    }
    if (bits >= 1 << 30) {
      // `bits` cannot exceed 2**30 because `indexOf` relies on
      // `Buffer.readUInt32LE` (also, the array would be larger than 128 MiB,
      // which may not be desiderable). This is 30 and not 32 because `1 << 32
      // === 1` and `1 << 31 === -2147483648`
      throw new Error(`bits cannot exceed 2**30 (got ${bits})`)
    }
    if (!isPowerOf2(bits)) {
      // Having `bits` as a power of 2 means that `bytes` (calculated below)
      // will be a power of 2, and this allows efficient items lookup without
      // using any modulo operator
      throw new Error(`bits must be a power of 2`)
    }
    const bytes = bits >> 3
    this.bitArray = Buffer.alloc(bytes)
    this.bitMask = bits - 1
  }

  private indexOf(item: Buffer): [byte: number, bit: number] {
    // One of the assumption for this BloomFilter is that the items contain
    // random data, so that we can skip hashing it. With that assumption in
    // mind, we take the first `bits` out of `item` and use that as the index
    // in the array.
    const index = item.readUInt32LE(0) & this.bitMask
    const byte = index >> 3
    const bit = index & 0b111
    return [byte, bit]
  }

  /**
   * Adds the item to the set.
   */
  put(item: Buffer) {
    const [byte, bit] = this.indexOf(item)
    this.bitArray[byte] |= 1 << bit
  }

  /**
   * Returns true if the item *may* have been previously added by a call to
   * `put()`, false otherwise. This method may return false positives, but
   * never returns false negatives.
   */
  maybeHas(item: Buffer): boolean {
    const [byte, bit] = this.indexOf(item)
    return !!(this.bitArray[byte] & (1 << bit))
  }
}
