/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { NodeFileProvider } from '../fileSystems'
import { getUniqueTestDataDir } from '../testUtilities'
import { KeyStore } from './keyStore'

describe('KeyStore', () => {
  it('should load file store', async () => {
    const dir = getUniqueTestDataDir()
    const files = await new NodeFileProvider().init()

    const store = new KeyStore<{ foo: string }>(files, 'store', { foo: 'bar' }, dir)

    expect(store.get('foo')).toEqual('bar')
    store.set('foo', 'baz')
    expect(store.get('foo')).toEqual('baz')
    await store.save()

    await store.load()
    expect(store.get('foo')).toEqual('baz')
  })

  it('should validate schema in load', async () => {
    const dir = getUniqueTestDataDir()
    const files = await new NodeFileProvider().init()

    const schema = yup
      .object({
        foo: yup.string().strict(true),
      })
      .defined()

    const store1 = new KeyStore<{ foo: number }>(files, 'store', { foo: 0 }, dir)
    const store2 = new KeyStore<{ foo: string }>(files, 'store', { foo: 'bar' }, dir, schema)

    store1.set('foo', 5)
    await store1.save()
    await expect(store2.load()).rejects.toThrow('foo must be a `string`')
  })

  it('should use schema result in load', async () => {
    const dir = getUniqueTestDataDir()
    const files = await new NodeFileProvider().init()

    const schema = yup
      .object({
        foo: yup.string().trim(),
      })
      .defined()

    const store1 = new KeyStore<{ foo: string }>(files, 'store', { foo: 'bar' }, dir)
    const store2 = new KeyStore<{ foo: string }>(files, 'store', { foo: 'bar' }, dir, schema)

    store1.set('foo', ' hello ')
    await store1.save()
    expect(store1.get('foo')).toEqual(' hello ')

    await store2.load()
    expect(store2.get('foo')).toEqual('hello')
  })

  it('should validate schema in set', async () => {
    const dir = getUniqueTestDataDir()
    const files = await new NodeFileProvider().init()

    const schema = yup
      .object({
        foo: yup.number(),
      })
      .defined()

    const store = new KeyStore<{ foo: number }>(files, 'store', { foo: 0 }, dir, schema)

    expect(() => store.set('foo', 'Hello world' as unknown as number)).toThrow(
      'this must be a `number` type',
    )
  })

  it('should use schema result in set', async () => {
    const dir = getUniqueTestDataDir()
    const files = await new NodeFileProvider().init()

    const schema = yup
      .object({
        foo: yup.string().trim(),
      })
      .defined()

    const store = new KeyStore<{ foo: string }>(files, 'store', { foo: '' }, dir, schema)

    store.set('foo', ' trim me ')
    expect(store.get('foo')).toEqual('trim me')
  })

  it('isSet should return false when default config used', async () => {
    const dir = getUniqueTestDataDir()
    const files = await new NodeFileProvider().init()

    // Not set
    let store = new KeyStore<{ foo: string }>(files, 'store', { foo: '' }, dir)
    expect(store.isSet('foo')).toBe(false)

    // Set in override
    store.setOverride('foo', '')
    expect(store.isSet('foo')).toBe(true)

    // Now its set in the file itself
    store.set('foo', 'set')
    await store.save()
    store = new KeyStore<{ foo: string }>(files, 'store', { foo: '' }, dir)
    await store.load()
    expect(store.isSet('foo')).toBe(true)
  })

  it('should save when put matches default', async () => {
    const dir = getUniqueTestDataDir()
    const files = await new NodeFileProvider().init()

    let store = new KeyStore<{ foo: string }>(files, 'store', { foo: 'default' }, dir)
    expect(store.isSet('foo')).toBe(false)

    store.set('foo', 'default')
    expect(store.isSet('foo')).toBe(true)

    await store.save()
    store = new KeyStore<{ foo: string }>(files, 'store', { foo: '' }, dir)
    await store.load()
    expect(store.get('foo')).toEqual('default')
  })
})
