/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NodeFileProvider } from './fileSystems'
import { getRuntime, IronfishSdk } from './sdk'
import os from 'os'
import { Config } from './fileStores'
import { Accounts } from './account'
import { IronfishIpcClient } from './rpc'
import { IronfishNode } from './node'

describe('IronfishSdk', () => {
  it('should initialize an SDK', async () => {
    const dataDir = os.tmpdir()

    const fileSystem = new NodeFileProvider()
    await fileSystem.init()

    const sdk = await IronfishSdk.init({
      configName: 'foo.config.json',
      dataDir: dataDir,
      fileSystem: fileSystem,
    })

    expect(sdk.config).toBeInstanceOf(Config)
    expect(sdk.client).toBeInstanceOf(IronfishIpcClient)
    expect(sdk.fileSystem).toBe(fileSystem)

    expect(sdk.config.storage.dataDir).toBe(dataDir)
    expect(sdk.config.storage.configPath).toContain('foo.config.json')
  })

  it('should detect platform defaults', async () => {
    const sdk = await IronfishSdk.init({ dataDir: os.tmpdir() })
    const runtime = getRuntime()

    expect(sdk.fileSystem).toBeInstanceOf(NodeFileProvider)
    expect(runtime).toBe('node')
  })

  it('should create a node', async () => {
    const fileSystem = new NodeFileProvider()
    await fileSystem.init()

    const sdk = await IronfishSdk.init({
      configName: 'foo.config.json',
      dataDir: os.tmpdir(),
      fileSystem: fileSystem,
    })

    const node = await sdk.node({ databaseName: 'foo' })

    expect(node).toBeInstanceOf(IronfishNode)
    expect(node.files).toBe(fileSystem)
    expect(node.config).toBe(sdk.config)
    expect(node.accounts).toBeInstanceOf(Accounts)
    expect(node.config.get('databaseName')).toBe('foo')
  })
})
