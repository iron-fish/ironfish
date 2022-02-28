/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import os from 'os'
import { Accounts } from './account'
import { Config } from './fileStores'
import { NodeFileProvider } from './fileSystems'
import { IronfishNode } from './node'
import { Platform } from './platform'
import { IronfishIpcClient } from './rpc'
import { IronfishSdk } from './sdk'

describe('IronfishSdk', () => {
  describe('init', () => {
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
      const runtime = Platform.getRuntime()

      expect(sdk.fileSystem).toBeInstanceOf(NodeFileProvider)
      expect(runtime.type).toBe('node')
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

  describe('connectRpc', () => {
    describe('when local is true', () => {
      it('returns and connects `clientMemory` to a node', async () => {
        const sdk = await IronfishSdk.init()
        const node = await sdk.node()
        const connect = jest.spyOn(sdk.clientMemory, 'connect')
        const openDb = jest.spyOn(node, 'openDB').mockImplementationOnce(async () => {})
        jest.spyOn(sdk, 'node').mockResolvedValueOnce(node)

        const client = await sdk.connectRpc(true)

        expect(connect).toHaveBeenCalledTimes(1)
        expect(connect).toBeCalledWith({ node })
        expect(openDb).toHaveBeenCalledTimes(1)
        expect(client).toMatchObject(sdk.clientMemory)
      })
    })

    describe('when local is false', () => {
      it('connects to and returns `client`', async () => {
        const sdk = await IronfishSdk.init()
        const connect = jest.spyOn(sdk.client, 'connect').mockImplementationOnce(async () => {})

        const client = await sdk.connectRpc(false)

        expect(connect).toHaveBeenCalledTimes(1)
        expect(client).toMatchObject(sdk.client)
      })
    })
  })
})
