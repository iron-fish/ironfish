/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NodeFileProvider } from '../fileSystems'
import { getUniqueTestDataDir } from '../testUtilities'
import { flushTimeout } from '../testUtilities/helpers/tests'
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

  it('should load file if it is empty', async () => {
    const dir = getUniqueTestDataDir()
    const files = await new NodeFileProvider().init()

    await files.mkdir(dir, { recursive: true })
    await files.writeFile(files.join(dir, '/test'), '')

    const store = new FileStore(files, 'test', dir)
    const result = await store.load()
    expect(result).toBeNull()

    await store.save({ foo: 'hello' })
    const loaded = await store.load()
    expect(loaded).toMatchObject({ foo: 'hello' })
  })

  it('should prevent multiple writes to the file before the promise completes', async () => {
    const dir = getUniqueTestDataDir()
    const files = new NodeFileProvider()
    const writeFileSpy = jest.spyOn(files, 'writeFile')
    await files.init()
    const store = new FileStore<{ foo: string }>(files, 'test', dir)

    const [promiseFirstWrite, resolveFirstWrite] = PromiseUtils.split<void>()
    writeFileSpy.mockReturnValueOnce(promiseFirstWrite)

    const save1 = store.save({ foo: 'hello' })
    const save2 = store.save({ foo: 'hello' })

    // Mutex starts unlocked, save1 is free to execute
    // Flush multiple times to ensure all the promises settle as expected
    await flushTimeout()
    await flushTimeout()
    await flushTimeout()
    await flushTimeout()
    expect(writeFileSpy).toHaveBeenCalledTimes(1)

    resolveFirstWrite()
    await save1
    await save2
    expect(writeFileSpy).toHaveBeenCalledTimes(2)
  })
})
