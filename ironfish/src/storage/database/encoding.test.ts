/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import leveldown from 'leveldown'
import { PrefixEncoding, PrefixSizeError, StringEncoding } from '../database'
import { StorageUtils } from '../database/utils'
import { LevelupDatabase } from '../levelup'

describe('Encoding', () => {
  const db = new LevelupDatabase(
    leveldown(`./testdbs/${Math.round(Math.random() * Number.MAX_SAFE_INTEGER)}`),
  )

  afterEach(async () => {
    await db.close()
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
      await expect(prefixStore.getAllValues()).resolves.toMatchObject(['a', 'b'])
      await expect(prefixStore.getAllKeys()).resolves.toMatchObject([
        ['a', 'a'],
        ['b', 'b'],
      ])
      await expect(prefixStore.getAllValues(undefined, keyRangeA)).resolves.toMatchObject(['a'])
      await expect(prefixStore.getAllValues(undefined, keyRangeB)).resolves.toMatchObject(['b'])

      await prefixStore.clear(undefined, keyRangeA)

      await expect(prefixStore.get(['a', 'a'])).resolves.toBe(undefined)
      await expect(prefixStore.get(['b', 'b'])).resolves.toBe('b')
      await expect(prefixStore.getAllValues(undefined, keyRangeA)).resolves.toMatchObject([])
      await expect(prefixStore.getAllValues(undefined, keyRangeB)).resolves.toMatchObject(['b'])

      await prefixStore.clear(undefined, keyRangeB)

      // Now try transactions
      await db.transaction(async (tx) => {
        await prefixStore.put(['a', 'a'], 'a', tx)
        await expect(prefixStore.getAllValues(tx, keyRangeA)).resolves.toMatchObject(['a'])
        await prefixStore.clear(tx, keyRangeA)
        await expect(prefixStore.getAllValues(tx, keyRangeA)).resolves.toMatchObject([])

        await prefixStore.put(['b', 'b'], 'b', tx)
        await expect(prefixStore.getAllValues(tx, keyRangeB)).resolves.toMatchObject(['b'])
        await prefixStore.clear(tx, keyRangeB)
        await expect(prefixStore.getAllValues(tx, keyRangeB)).resolves.toMatchObject([])
      })

      await expect(prefixStore.getAllValues(undefined, keyRangeA)).resolves.toMatchObject([])
      await expect(prefixStore.getAllValues(undefined, keyRangeB)).resolves.toMatchObject([])
    })

    it('should error with incorrect prefix size', async () => {
      await db.open()

      const prefix = Buffer.alloc(10, 'a').toString('utf8')
      const key = [prefix, 'a'] as const

      await expect(prefixStore.get(key)).rejects.toThrow(PrefixSizeError)
    })
  })
})
