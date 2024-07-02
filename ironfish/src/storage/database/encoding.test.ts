/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import leveldown from 'leveldown'
import {
  BigU64BEEncoding,
  BufferEncoding,
  PrefixArrayEncoding,
  PrefixEncoding,
  PrefixSizeError,
  StringEncoding,
} from '../database'
import { StorageUtils } from '../database/utils'
import { LevelupDatabase } from '../levelup'

describe('Encoding', () => {
  const db = new LevelupDatabase(
    leveldown(`./testdbs/${Math.round(Math.random() * Number.MAX_SAFE_INTEGER)}`),
  )

  afterEach(async () => {
    await db.close()
  })

  describe('PrefixArrayEncoding', () => {
    it('should encode and decode', () => {
      const encoding = new PrefixArrayEncoding<[Buffer, Buffer, bigint, Buffer]>([
        [new BufferEncoding(), 4],
        [new BufferEncoding(), 32],
        [new BigU64BEEncoding(), 8],
        [new BufferEncoding(), 32],
      ])

      const a = Buffer.alloc(4, Math.random().toString())
      const b = Buffer.alloc(32, Math.random().toString())
      const c = BigInt(Math.floor(Math.random() * 10000000))
      const d = Buffer.alloc(32, Math.random().toString())

      const encoded = encoding.serialize([a, b, c, d])
      const decoded = encoding.deserialize(encoded)

      expect(decoded[0].equals(a)).toBe(true)
      expect(decoded[1].equals(b)).toBe(true)
      expect(decoded[2]).toEqual(c)
      expect(decoded[3].equals(d)).toBe(true)
    })

    it('should throw error if length wrong', () => {
      const encoding = new PrefixArrayEncoding<[Buffer]>([[new BufferEncoding(), 4]])
      expect(() => encoding.serialize([Buffer.alloc(10)])).toThrow(PrefixSizeError)
    })

    it('should compare to PrefixEncoding', () => {
      const encodingA = new PrefixArrayEncoding<[Buffer, Buffer, bigint, Buffer]>([
        [new BufferEncoding(), 4],
        [new BufferEncoding(), 32],
        [new BigU64BEEncoding(), 8],
        [new BufferEncoding(), 32],
      ])

      const encodingB = new PrefixEncoding(
        new BufferEncoding(),
        new PrefixEncoding(
          new BufferEncoding(),
          new PrefixEncoding(new BigU64BEEncoding(), new BufferEncoding(), 8),
          32,
        ),
        4,
      )

      const a = Buffer.alloc(4, Math.random().toString())
      const b = Buffer.alloc(32, Math.random().toString())
      const c = BigInt(Math.floor(Math.random() * 10000000))
      const d = Buffer.alloc(32, Math.random().toString())

      const encodedA = encodingA.serialize([a, b, c, d])
      const encodedB = encodingB.serialize([a, [b, [c, d]]])

      expect(encodedA.equals(encodedB)).toBe(true)
    })
  })

  describe('PrefixEncoding', () => {
    const prefixStore = db.addStore<{ key: [string, string]; value: string }>({
      name: 'PrefixEncoding',
      keyEncoding: new PrefixEncoding<string, string>(
        new StringEncoding(),
        new StringEncoding(),
        1,
      ),
      valueEncoding: new StringEncoding(),
    })

    it('should prefix keys', async () => {
      await db.open()

      const keyRangeA = StorageUtils.getPrefixKeyRange(Buffer.from('a'))
      const keyRangeB = StorageUtils.getPrefixKeyRange(Buffer.from('b'))

      // Write operations
      await prefixStore.put(['a', 'a'], 'a')
      await prefixStore.put(['b', 'b'], 'b')

      // Read operations
      await expect(prefixStore.get(['a', 'a'])).resolves.toBe('a')
      await expect(prefixStore.get(['a', 'b'])).resolves.toBe(undefined)
      await expect(prefixStore.get(['b', 'a'])).resolves.toBe(undefined)
      await expect(prefixStore.get(['b', 'b'])).resolves.toBe('b')

      // Iteration operations
      await expect(prefixStore.getAllValues()).resolves.toEqual(['a', 'b'])
      await expect(prefixStore.getAllKeys()).resolves.toEqual([
        ['a', 'a'],
        ['b', 'b'],
      ])
      await expect(prefixStore.getAllValues(undefined, keyRangeA)).resolves.toEqual(['a'])
      await expect(prefixStore.getAllValues(undefined, keyRangeB)).resolves.toEqual(['b'])

      await prefixStore.clear(undefined, keyRangeA)

      await expect(prefixStore.get(['a', 'a'])).resolves.toBe(undefined)
      await expect(prefixStore.get(['b', 'b'])).resolves.toBe('b')
      await expect(prefixStore.getAllValues(undefined, keyRangeA)).resolves.toEqual([])
      await expect(prefixStore.getAllValues(undefined, keyRangeB)).resolves.toEqual(['b'])

      await prefixStore.clear(undefined, keyRangeB)

      // Now try transactions
      await db.transaction(async (tx) => {
        await prefixStore.put(['a', 'a'], 'a', tx)
        await expect(prefixStore.getAllValues(tx, keyRangeA)).resolves.toEqual(['a'])
        await prefixStore.clear(tx, keyRangeA)
        await expect(prefixStore.getAllValues(tx, keyRangeA)).resolves.toEqual([])

        await prefixStore.put(['b', 'b'], 'b', tx)
        await expect(prefixStore.getAllValues(tx, keyRangeB)).resolves.toEqual(['b'])
        await prefixStore.clear(tx, keyRangeB)
        await expect(prefixStore.getAllValues(tx, keyRangeB)).resolves.toEqual([])
      })

      await expect(prefixStore.getAllValues(undefined, keyRangeA)).resolves.toEqual([])
      await expect(prefixStore.getAllValues(undefined, keyRangeB)).resolves.toEqual([])
    })

    it('should error with incorrect prefix size', async () => {
      await db.open()

      const prefix = Buffer.alloc(10, 'a').toString('utf8')
      const key = [prefix, 'a'] as const

      await expect(prefixStore.get(key)).rejects.toThrow(PrefixSizeError)
    })
  })
})
