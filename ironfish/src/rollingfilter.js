
'use strict';

const {enforce} = require('bsert');
const {encoding} = require('bufio');
const MurmurHash3 = require('imurmurhash');
const DUMMY = Buffer.alloc(0);

/**
 * Rolling Bloom Filter
 */

class RollingFilter {
  /**
   * Create a rolling bloom filter.
   * @constructor
   * @param {Number} items - Expected number of items.
   * @param {Number} rate - False positive rate (0.0-1.0).
   */

  constructor(items, rate) {
    this.entries = 0;
    this.generation = 1;
    this.n = 0;
    this.limit = 0;
    this.size = 0;
    this.items = 0;
    this.tweak = 0;
    this.filter = DUMMY;

    if (items != null)
      this.fromRate(items, rate);
  }

  /**
   * Inject properties from items and FPR.
   * @private
   * @param {Number} items - Expected number of items.
   * @param {Number} rate - False positive rate (0.0-1.0).
   * @returns {RollingFilter}
   */

  fromRate(items, rate) {
    // enforce(Number.isSafeInteger(items) && items > 0, 'items', 'integer');
    // enforce(typeof rate === 'number' && isFinite(rate), 'rate', 'number');
    // enforce(rate >= 0 && rate <= 1, 'rate', 'range between 0.1 and 1.0.');

    console.log("PASSED ARGS: {}, {}", items, rate)
    const logRate = Math.log(rate);
    console.log('logRate', logRate)

    const n = Math.max(1, Math.min(Math.round(logRate / Math.log(0.5)), 50));
    console.log('n', n)
    const limit = (items + 1) / 2 | 0;
    console.log('limit', limit)

    const max = limit * 3;
    console.log('max', max)

    let size = -1 * n * max / Math.log(1.0 - Math.exp(logRate / n));
    console.log('size1', size)
    size = Math.ceil(size);
    console.log('size2', size)

    items = ((size + 63) / 64 | 0) << 1;
    console.log('items1', items)
    items >>>= 0;
    console.log('items2', items)
    items = Math.max(1, items);
    console.log('items3', items)

    const tweak = (Math.random() * 0x100000000) >>> 0;
    console.log('tweak', tweak)

    const filter = Buffer.alloc(items * 8, 0x00);
    console.log('filter', filter.length)

    this.n = n;
    this.limit = limit;
    this.size = size;
    this.items = items;
    this.tweak = tweak;
    this.filter = filter;

    return this;
  }

  /**
   * Instantiate rolling filter from items and FPR.
   * @param {Number} items - Expected number of items.
   * @param {Number} rate - False positive rate (0.0-1.0).
   * @returns {RollingFilter}
   */

  static fromRate(items, rate) {
    return new this().fromRate(items, rate);
  }

  /**
   * Perform the mumur3 hash on data.
   * @param {Buffer} value
   * @param {Number} seed
   * @returns {Number}
   */

  hash(value, n) {
    const seed = (n * 0xfba4c795) + (this.tweak | 0);
    console.log('hash seed', seed)
    return new MurmurHash3(value.toString('hex'), seed).result();
  }

  /**
   * Reset the filter.
   */

  // reset() {
  //   if (this.entries === 0)
  //     return;

  //   this.entries = 0;
  //   this.generation = 1;
  //   this.filter.fill(0);
  // }

  /**
   * Add data to the filter.
   * @param {Buffer|String}
   * @param {String?} enc - Can be any of the Buffer object's encodings.
   */

  add(value, enc) {
    const val = toBuffer(value, enc);

    if (this.entries === this.limit) {
      this.entries = 0;
      this.generation += 1;

      if (this.generation === 4)
        this.generation = 1;

      const m1 = (this.generation & 1) * 0xffffffff;
      const m2 = (this.generation >>> 1) * 0xffffffff;
      console.log("m1", m1)
      console.log("m2", m2)

      for (let i = 0; i < this.items; i += 2) {
        const pos1 = i * 8;
        const pos2 = (i + 1) * 8;
        const v1 = read(this.filter, pos1);
        const v2 = read(this.filter, pos2);
        const mhi = (v1.hi ^ m1) | (v2.hi ^ m2);
        const mlo = (v1.lo ^ m1) | (v2.lo ^ m2);
        console.log("pos1", pos1);
        console.log("pos2", pos2);
        console.log("v1", v1);
        console.log("v2", v2);
        console.log("mhi", mhi);
        console.log("mlo", mlo);

        v1.hi &= mhi;
        v1.lo &= mlo;
        v2.hi &= mhi;
        v2.lo &= mlo;

        write(this.filter, v1, pos1);
        write(this.filter, v2, pos2);
      }
    }

    this.entries += 1;

    for (let i = 0; i < this.n; i++) {
      const hash = this.hash(val, i);
      const bits = hash & 0x3f;
      const pos = (hash >>> 6) % this.items;
      const pos1 = (pos & ~1) * 8;
      const pos2 = (pos | 1) * 8;
      const bit = bits % 8;
      const oct = (bits - bit) / 8;
      console.log("hash", hash)
      console.log("bits", bits)
      console.log("pos", pos)
      console.log("pos1", pos1)
      console.log("pos2", pos2)
      console.log("bit", bit)
      console.log("oct", oct)

      this.filter[pos1 + oct] &= ~(1 << bit);
      this.filter[pos1 + oct] |= (this.generation & 1) << bit;

      this.filter[pos2 + oct] &= ~(1 << bit);
      this.filter[pos2 + oct] |= (this.generation >>> 1) << bit;
    }
  }

  /**
   * Test whether data is present in the filter.
   * @param {Buffer|String} value
   * @param {String?} enc - Can be any of the Buffer object's encodings.
   * @returns {Boolean}
   */

  // test(value, enc) {
  //   if (this.entries === 0)
  //     return false;

  //   const val = toBuffer(value, enc);

  //   for (let i = 0; i < this.n; i++) {
  //     const hash = this.hash(val, i);
  //     const bits = hash & 0x3f;
  //     const pos = (hash >>> 6) % this.items;
  //     const pos1 = (pos & ~1) * 8;
  //     const pos2 = (pos | 1) * 8;
  //     const bit = bits % 8;
  //     const oct = (bits - bit) / 8;

  //     const bit1 = (this.filter[pos1 + oct] >>> bit) & 1;
  //     const bit2 = (this.filter[pos2 + oct] >>> bit) & 1;

  //     if ((bit1 | bit2) === 0)
  //       return false;
  //   }

  //   return true;
  // }

  /**
   * Test whether data is present in the
   * filter and potentially add data.
   * @param {Buffer|String} value
   * @param {String?} enc - Can be any of the Buffer object's encodings.
   * @returns {Boolean} Whether data was added.
   */

  // added(value, enc) {
  //   const val = toBuffer(value, enc);

  //   if (!thistest(val)) {
  //     this.add(val);
  //     return true;
  //   }

  //   return false;
  // }
}

/*
 * Helpers
 */

class U64 {
  constructor(hi, lo) {
    this.hi = hi;
    this.lo = lo;
  }
}

function read(data, off) {
  const hi = encoding.readU32(data, off + 4);
  const lo = encoding.readU32(data, off);
  return new U64(hi, lo);
}

function write(data, value, off) {
  encoding.writeU32(data, value.hi, off + 4);
  encoding.writeU32(data, value.lo, off);
}

function toBuffer(value, enc) {
  if (typeof value !== 'string') {
    enforce(Buffer.isBuffer(value), 'value', 'buffer');
    return value;
  }

  enforce(typeof enc === 'string', 'enc', 'string');

  return Buffer.from(value, enc);
}

/*
 * Expose
 */

// module.exports = RollingFilter;

let x = new RollingFilter(10000, 0.0000001)
let value = Buffer.from([1,2,3,4,5,6,7,8])
x.add(value)