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

  it('should use schema', async () => {
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
    await expect(store2.load()).rejects.toThrowError('foo must be a `string`')
  })

  it('should use schema result', async () => {
    const dir = getUniqueTestDataDir()
    const files = await new NodeFileProvider().init()

    const schema = yup
      .object({
        foo: yup.string().trim(),
      })
      .defined()

    const store = new KeyStore<{ foo: string }>(files, 'store', { foo: 'bar' }, dir, schema)
    store.set('foo', ' hello ')

    await store.save()
    expect(store.get('foo')).toEqual(' hello ')

    await store.load()
    expect(store.get('foo')).toEqual('hello')
  })
})
