/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NodeFileProvider } from '../fileSystems'
import { getUniqueTestDataDir } from '../testUtilities'
import { FileStore } from './fileStore'

describe('FileStore', () => {
  it('should load file store', async () => {
    const dir = getUniqueTestDataDir()
    const files = await new NodeFileProvider().init()

    const store = new FileStore<{ foo: string }>(files, 'test', dir)
    await store.save({ foo: 'hello' })

    const loaded = await store.load()
    expect(loaded).toMatchObject({ foo: 'hello' })
  })
})
