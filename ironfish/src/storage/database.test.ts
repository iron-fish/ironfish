/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '../testUtilities/matchers/error'
import leveldown from 'leveldown'
import { IJsonSerializable } from '../serde'
import { PromiseUtils } from '../utils'
import {
  ArrayEncoding,
  BufferEncoding,
  DatabaseSchema,
  DatabaseVersionError,
  DuplicateKeyError,
  JsonEncoding,
  StringEncoding,
} from './database'
import { LevelupDatabase, LevelupStore } from './levelup'

type FooValue = {
  hash: string
  name: string
}

interface FooSchema extends DatabaseSchema {
  key: string
  value: FooValue
}

interface BarSchema extends DatabaseSchema {
  key: string
  value: Buffer
}

interface BazSchema extends DatabaseSchema {
  key: Buffer
  value: string
}

interface TestSchema extends DatabaseSchema {
  key: string
  value: IJsonSerializable
}

interface ArrayKeySchema extends DatabaseSchema {
  key: [string, number, boolean]
  value: boolean
}

describe('Database', () => {
  const id = `./testdbs/${Math.round(Math.random() * Number.MAX_SAFE_INTEGER)}`
  const db = new LevelupDatabase(leveldown(id))

  const fooStore = db.addStore<FooSchema>({
    name: 'Foo',
    keyEncoding: new StringEncoding(),
    valueEncoding: new JsonEncoding<FooValue>(),
  })

  const barStore = db.addStore<BarSchema>({
    name: 'Bar',
    keyEncoding: new StringEncoding(),
    valueEncoding: new BufferEncoding(),
  })

  const bazStore = db.addStore<BazSchema>({
    name: 'Baz',
    keyEncoding: new BufferEncoding(),
    valueEncoding: new StringEncoding(),
  })

  // Prefix key is modified during tests, don't use in other tests
  const testPrefixKeyStore = db.addStore<BazSchema>({
    name: 'PrefixKey',
    keyEncoding: new BufferEncoding(),
    valueEncoding: new StringEncoding(),
  })

  const testStore = db.addStore<TestSchema>({
    name: 'Test',
    keyEncoding: new StringEncoding(),
    valueEncoding: new JsonEncoding(),
  })

  const arrayKeyStore = db.addStore<ArrayKeySchema>({
    name: 'ArrayKey',
    keyEncoding: new ArrayEncoding<[string, number, boolean]>(),
    valueEncoding: new JsonEncoding<boolean>(),
  })

  afterEach(async () => {
    await db.close()
  })

  it('should upgrade and throw upgrade error', async () => {
    await db.open()
    expect(await db.metaStore.get('version')).toBe(undefined)
    expect(await db.getVersion()).toBe(0)

    await expect(db.upgrade(1)).toRejectErrorInstance(DatabaseVersionError)

    await db.putVersion(1)
    expect(await db.metaStore.get('version')).toBe(1)
    expect(await db.getVersion()).toBe(1)
  })

  it('should store and get values', async () => {
    await db.open()
    const foo = { hash: 'hello', name: '@ironfish/sdk' }
    const fooHash = Buffer.from(JSON.stringify(foo))

    await fooStore.put('hello', foo)
    await barStore.put('hello', fooHash)
    await bazStore.put(fooHash, 'hello')

    expect(await fooStore.get('hello')).toMatchObject(foo)
    expect(await barStore.get('hello')).toEqual(fooHash)
    expect(await bazStore.get(fooHash)).toEqual('hello')

    await fooStore.del('hello')
    await barStore.del('hello')
    await bazStore.del(fooHash)

    expect(await fooStore.get('hello')).not.toBeDefined()
    expect(await barStore.get('hello')).not.toBeDefined()
    expect(await bazStore.get(fooHash)).not.toBeDefined()
  })

  it('should clear store', async () => {
    await db.open()
    const foo = { hash: 'hello', name: '@ironfish/sdk' }
    const fooHash = Buffer.from(JSON.stringify(foo))

    await fooStore.put('hello', foo)
    await barStore.put('hello', fooHash)

    expect(await fooStore.get('hello')).toMatchObject(foo)
    expect(await barStore.get('hello')).toEqual(fooHash)

    await fooStore.clear()

    expect(await fooStore.get('hello')).not.toBeDefined()
    expect(await barStore.get('hello')).toEqual(fooHash)
  })

  it('should add values', async () => {
    await db.open()
    await db.metaStore.clear()

    await db.metaStore.add('a', 1)
    await expect(db.metaStore.get('a')).resolves.toBe(1)

    await expect(db.metaStore.add('a', 2)).rejects.toThrow(DuplicateKeyError)
    await expect(db.metaStore.get('a')).resolves.toBe(1)
  })

  it('should add values in transactions', async () => {
    await db.open()
    await db.metaStore.clear()

    await db.transaction(async (tx) => {
      // db=undefined, tx=1
      await db.metaStore.add('a', 1, tx)
      await expect(db.metaStore.get('a', tx)).resolves.toBe(1)

      // db=undefined, tx=2
      await expect(db.metaStore.add('a', 2, tx)).rejects.toThrow(DuplicateKeyError)
      await expect(db.metaStore.get('a', tx)).resolves.toBe(1)
      await expect(db.metaStore.get('a')).resolves.toBeUndefined()
    })

    await expect(db.metaStore.get('a')).resolves.toBe(1)
  })

  it('should store array based keys', async () => {
    await db.open()
    await arrayKeyStore.put(['jason', 5, false], true)
    expect(await arrayKeyStore.get(['jason', 5, false])).toBe(true)
    expect(await arrayKeyStore.get(['jason', 5, true])).toBe(undefined)

    await arrayKeyStore.del(['jason', 5, false])
    expect(await arrayKeyStore.get(['jason', 5, false])).toBe(undefined)
  })

  it('should store nested buffers', async () => {
    interface NestedSchema extends DatabaseSchema {
      key: string
      value: {
        buffer: Buffer
      }
    }

    const store = db.addStore<NestedSchema>({
      name: 'Nested',
      keyEncoding: new StringEncoding(),
      valueEncoding: new JsonEncoding<{ buffer: Buffer }>(),
    })

    await db.open()

    const buffer = Buffer.alloc(2, 10)

    await store.put('a', { buffer: buffer })
    const stored = await store.get('a')

    expect(stored).toBeTruthy()
    expect(stored?.buffer).toBeInstanceOf(Buffer)
    expect(stored?.buffer.byteLength).toBe(2)
    expect(stored?.buffer[0]).toBe(10)
    expect(stored?.buffer[1]).toBe(10)
  })

  describe('DatabaseBatch', () => {
    it('should batch array of writes', async () => {
      await db.open()

      const foo = { hash: 'hello', name: '@ironfish/sdk' }
      const fooHash = Buffer.from(JSON.stringify(foo))

      await db.batch([
        [fooStore, 'hello', foo],
        [barStore, 'hello', fooHash],
        [bazStore, fooHash, 'hello'],
      ])

      expect(await fooStore.get('hello')).toMatchObject(foo)
      expect(await barStore.get('hello')).toEqual(fooHash)
      expect(await bazStore.get(fooHash)).toEqual('hello')

      await db.batch([
        [fooStore, 'hello'],
        [barStore, 'hello'],
        [bazStore, fooHash],
      ])

      expect(await fooStore.get('hello')).not.toBeDefined()
      expect(await barStore.get('hello')).not.toBeDefined()
      expect(await bazStore.get(fooHash)).not.toBeDefined()
    })

    it('should batch chained of writes', async () => {
      await db.open()

      const foo = { hash: 'hello', name: '@ironfish/sdk' }
      const fooHash = Buffer.from(JSON.stringify(foo))

      await db
        .batch()
        .put(fooStore, 'hello', foo)
        .put(barStore, 'hello', fooHash)
        .put(bazStore, fooHash, 'hello')
        .commit()

      expect(await fooStore.get('hello')).toMatchObject(foo)
      expect(await barStore.get('hello')).toEqual(fooHash)
      expect(await bazStore.get(fooHash)).toEqual('hello')

      await db
        .batch()
        .del(fooStore, 'hello')
        .del(barStore, 'hello')
        .del(bazStore, fooHash)
        .commit()

      expect(await fooStore.get('hello')).not.toBeDefined()
      expect(await barStore.get('hello')).not.toBeDefined()
      expect(await bazStore.get(fooHash)).not.toBeDefined()
    })
  })

  describe('DatabaseTransaction', () => {
    it('should write in transaction manually', async () => {
      await db.open()

      const foo = { hash: 'hello', name: '@ironfish/sdk' }
      const fooHash = Buffer.from(JSON.stringify(foo))

      let transaction = db.transaction()
      await fooStore.put('hello', foo, transaction)
      await barStore.put('hello', fooHash, transaction)
      await bazStore.put(fooHash, 'hello', transaction)
      await transaction.commit()

      expect(await fooStore.get('hello')).toMatchObject(foo)
      expect(await barStore.get('hello')).toEqual(fooHash)
      expect(await bazStore.get(fooHash)).toEqual('hello')

      transaction = db.transaction()
      await fooStore.del('hello', transaction)
      await barStore.del('hello', transaction)
      await bazStore.del(fooHash, transaction)

      expect(await fooStore.get('hello')).toMatchObject(foo)
      expect(await barStore.get('hello')).toEqual(fooHash)
      expect(await bazStore.get(fooHash)).toEqual('hello')

      // Now commit transaction
      await transaction.commit()

      expect(await fooStore.get('hello')).not.toBeDefined()
      expect(await barStore.get('hello')).not.toBeDefined()
      expect(await bazStore.get(fooHash)).not.toBeDefined()
    })

    it('should update but not release lock', async () => {
      await db.open()
      let locked = false

      // Create 2 transactions
      const transactionA = db.transaction()
      const transactionB = db.transaction()

      // Lock transactionA
      await testStore.put('hello', 1, transactionA)

      // Attempt to lock B which will hang on A
      const hanging = testStore.put('hello', 3, transactionB).then(() => {
        locked = true
      })

      await transactionA.update()
      expect(locked).toBe(false)
      expect(await testStore.get('hello')).toEqual(1)

      await testStore.put('hello', 2, transactionA)
      await transactionA.commit()

      await hanging
      expect(locked).toBe(true)
      expect(await testStore.get('hello')).toEqual(2)

      await transactionB.commit()
      expect(await testStore.get('hello')).toEqual(3)
    })

    it('should write in transaction automatically', async () => {
      await db.open()

      const foo = { hash: 'hello', name: '@ironfish/sdk' }
      const fooHash = Buffer.from(JSON.stringify(foo))

      await expect(() =>
        db.transaction<void>(async (transaction) => {
          await fooStore.put('hello', foo, transaction)
          await barStore.put('hello', fooHash, transaction)
          await bazStore.put(fooHash, 'hello', transaction)
          throw new Error('Aborted Transaction!')
        }),
      ).rejects.toThrowError('Aborted')

      expect(await fooStore.get('hello')).not.toBeDefined()
      expect(await barStore.get('hello')).not.toBeDefined()
      expect(await bazStore.get(fooHash)).not.toBeDefined()

      await db.transaction<void>(async (transaction) => {
        await fooStore.put('hello', foo, transaction)
        await barStore.put('hello', fooHash, transaction)
        await bazStore.put(fooHash, 'hello', transaction)
      })

      await db.transaction<void>(async (transaction) => {
        await fooStore.del('hello', transaction)
        await barStore.del('hello', transaction)
        await bazStore.del(fooHash, transaction)

        // Should not be commited until this function returns
        expect(await fooStore.get('hello')).toMatchObject(foo)
        expect(await barStore.get('hello')).toEqual(fooHash)
        expect(await bazStore.get(fooHash)).toEqual('hello')
      })

      expect(await fooStore.get('hello')).not.toBeDefined()
      expect(await barStore.get('hello')).not.toBeDefined()
      expect(await bazStore.get(fooHash)).not.toBeDefined()
    })

    it('should cache transaction operations', async () => {
      await db.open()

      const foo = { hash: 'hello', name: '@ironfish/sdk' }
      const bar = { hash: 'hello', name: 'world' }

      // With an automatic transaction
      await db.transaction<void>(async (transaction) => {
        await fooStore.put('cache', bar)
        await fooStore.del('cache', transaction)

        expect(await fooStore.get('cache', transaction)).toBeUndefined()
        expect(await fooStore.get('cache')).toMatchObject(bar)

        await fooStore.put('cache', foo, transaction)

        expect(await fooStore.get('cache', transaction)).toMatchObject(foo)
        expect(await fooStore.get('cache')).toMatchObject(bar)

        expect(await fooStore.has('cache', transaction)).toBe(true)
        expect(await fooStore.has('cache')).toBe(true)
      })

      expect(await fooStore.get('cache')).toMatchObject(foo)
      expect(await fooStore.has('cache')).toBe(true)
    })

    it('should cache has and del missing values', async () => {
      await db.open()
      await db.metaStore.clear()

      await db.transaction(async (tx) => {
        // db=undefined, tx=undefined
        expect(await db.metaStore.get('a', tx)).toBeUndefined()

        // db=1, tx=undefined
        await db.metaStore.put('a', 1)
        expect(await db.metaStore.get('a', tx)).toBeUndefined()

        // db=1, tx=1
        await db.metaStore.put('a', 1, tx)
        expect(await db.metaStore.get('a', tx)).toBe(1)

        // db=1, tx=undefined
        await db.metaStore.del('a', tx)
        expect(await db.metaStore.get('a', tx)).toBe(undefined)
      })
    })
  })

  describe('DatabaseTransaction: withTransaction', () => {
    it('should commit transaction', async () => {
      await db.open()
      await db.metaStore.put('test', 0)

      await db.withTransaction(null, async (transaction) => {
        await db.metaStore.put('test', 1, transaction)
        expect(await db.metaStore.get('test')).toBe(0)
      })

      expect(await db.metaStore.get('test')).toBe(1)
    })

    it('should abort transaction if error thrown', async () => {
      await db.open()
      await db.metaStore.put('test', 0)

      await expect(
        db.withTransaction(null, async (transaction) => {
          await db.metaStore.put('test', 1, transaction)
          throw new Error('test')
        }),
      ).rejects.toThrowError('test')

      expect(await db.metaStore.get('test')).toBe(0)
    })

    it('should abort transaction if calls abort', async () => {
      await db.open()
      await db.metaStore.put('test', 0)

      await db.withTransaction(null, async (transaction) => {
        await db.metaStore.put('test', 1, transaction)
        await transaction.abort()
      })

      expect(await db.metaStore.get('test')).toBe(0)
    })

    it('should properly nest transactions', async () => {
      await db.open()
      await db.metaStore.put('test', 0)
      const transaction = db.transaction()

      await db.withTransaction(transaction, async (transaction) => {
        await db.metaStore.put('test', 1, transaction)

        await db.withTransaction(transaction, async (transaction) => {
          await db.metaStore.put('test', 2, transaction)
        })

        // Should not commit after inner withTransaction
        expect(await db.metaStore.get('test')).toBe(0)
      })

      // Should not commit after outer withTransaction
      expect(await db.metaStore.get('test')).toBe(0)

      await transaction.commit()
      expect(await db.metaStore.get('test')).toBe(2)
    })

    it('should wait for a lock before executing the handler', async () => {
      await db.open()

      let value = ''

      const [waitingPromise, waitingResolve] = PromiseUtils.split<void>()

      // Queue up two transactions
      const t1 = db.transaction(async () => {
        value += 't1'
        await waitingPromise
      })

      const t2 = db.transaction(async () => {
        value += 't2'
        await waitingPromise
      })

      const t3 = db.transaction(async () => {
        value += 't3'
        await waitingPromise
      })

      // We need this here to flush the pending promises synchronously,
      // because if you don't, then t1 won't execute eagerly because of
      // how Mutex is implemented. Mutex.lock depends on deferred promise
      // execution and cannot execute eagerly.
      await PromiseUtils.sleep(0)

      // t2's handler should not have been called yet
      expect(value).toEqual('t1')

      // Resolve the promise and wait for the transactions to finish
      waitingResolve()
      await Promise.all([t1, t2, t3])

      // t2's handler should have executed,
      // then t3's handler should have executed
      expect(value).toEqual('t1t2t3')
    })
  })

  describe('DatabaseStore: key and value streams', () => {
    it('should get all keys', async () => {
      await db.open()
      await db.metaStore.clear()
      await db.metaStore.put('a', 1000)
      await db.metaStore.put('b', 1001)
      await db.metaStore.put('c', 1002)
      await db.metaStore.put('d', 1003)

      const values = await db.metaStore.getAllValues()

      expect(values).toHaveLength(4)
      expect(values).toContain(1000)
      expect(values).toContain(1001)
      expect(values).toContain(1002)
      expect(values).toContain(1003)

      const keys = await db.metaStore.getAllKeys()

      expect(keys).toHaveLength(4)
      expect(keys).toContain('a')
      expect(keys).toContain('b')
      expect(keys).toContain('c')
      expect(keys).toContain('d')
    })

    it('should encode and decode keys', async () => {
      await db.open()
      await bazStore.clear()

      const hash = Buffer.from([0x54, 0x57, 0xf6, 0x2c])

      // in a transaction
      await db.transaction(async (tx) => {
        await bazStore.add(hash, 'VALUE', tx)
        const keys = await bazStore.getAllKeys(tx)
        expect(keys.length).toBe(1)
        expect(keys[0]?.equals(hash)).toBe(true)
      })

      // and out of a transaction
      const keys = await bazStore.getAllKeys()
      expect(keys.length).toBe(1)
      expect(keys[0]?.equals(hash)).toBe(true)
    })

    it('should get transactional values', async () => {
      await db.open()
      await db.metaStore.clear()

      await db.transaction(async (tx) => {
        // a, db=1000, tx=undefined
        await db.metaStore.put('a', 1000)
        let values = await db.metaStore.getAllValues(tx)
        expect(values).toHaveLength(1)
        expect(values).toContain(1000)

        // a, db=1000, tx=1001
        await db.metaStore.put('a', 1001, tx)
        values = await db.metaStore.getAllValues(tx)
        expect(values).toHaveLength(1)
        expect(values).toContain(1001)

        // b, db=undefined, tx=1002
        await db.metaStore.put('b', 1002, tx)
        values = await db.metaStore.getAllValues(tx)
        expect(values).toHaveLength(2)
        expect(values).toContain(1001)
        expect(values).toContain(1002)
      })
    })

    it('should not yield undefined', async () => {
      await db.open()
      await db.metaStore.clear()
      await db.metaStore.put('a', 1)

      await db.transaction(async (tx) => {
        expect(await db.metaStore.get('a', tx)).toBe(1)

        let values = await db.metaStore.getAllValues(tx)
        expect(values).toHaveLength(1)
        expect(values).toContain(1)

        // cache has undefined and should not yield
        await db.metaStore.del('a', tx)

        values = await db.metaStore.getAllValues(tx)
        expect(values).toHaveLength(0)
      })
    })

    it('should find entries that have 0xff keys', async () => {
      await db.open()
      await bazStore.clear()

      await bazStore.put(Buffer.alloc(100, 0xff), '1')
      expect((await bazStore.getAllKeys()).length).toBe(1)
    })

    it('should not find entries with an off-by-one prefix and empty key', async () => {
      await db.open()
      const keyStore = testPrefixKeyStore as LevelupStore<BazSchema>
      await keyStore.clear()

      // Increment the prefix buffer by one
      expect(keyStore.prefixBuffer).toEqual(Buffer.from([92, 188, 18, 188]))
      keyStore.prefixBuffer[keyStore.prefixBuffer.length - 1]++

      // Add an entry with an empty buffer for the key
      expect(keyStore.prefixBuffer).toEqual(Buffer.from([92, 188, 18, 189]))
      await keyStore.put(Buffer.alloc(0), '1')
      expect(await keyStore.get(Buffer.alloc(0))).toEqual('1')

      // Decrement the prefix buffer
      keyStore.prefixBuffer[keyStore.prefixBuffer.length - 1]--
      expect(keyStore.prefixBuffer).toEqual(Buffer.from([92, 188, 18, 188]))

      // No keys should exist
      expect(await keyStore.getAllKeys()).toHaveLength(0)
    })
  })
})
