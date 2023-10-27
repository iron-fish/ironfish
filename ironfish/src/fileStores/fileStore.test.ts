/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NodeFileProvider } from '../fileSystems'
import { getUniqueTestDataDir } from '../testUtilities'
import { PromiseUtils } from '../utils'
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

  it('should prevent multiple writes to the file before the promise completes', async () => {
    const dir = getUniqueTestDataDir()
    const files = new NodeFileProvider()
    const save = jest.spyOn(files, 'writeFile')
    await files.init()
    const store = new FileStore<{ foo: string }>(files, 'test', dir)

    const [promise, resolve] = PromiseUtils.split<void>()
    save.mockReturnValue(promise)

    const promise1 = store.save({ foo: 'hello' })
    const promise2 = store.save({ foo: 'hello' })
    expect(save).toHaveBeenCalledTimes(0)

    resolve()
    expect(save).toHaveBeenCalledTimes(0)

    await promise1
    expect(save).toHaveBeenCalledTimes(1)

    await promise2
    expect(save).toHaveBeenCalledTimes(2)
  })
})
