/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from './assert'
import { Config, DEFAULT_DATA_DIR } from './fileStores'
import { NodeFileProvider } from './fileSystems'
import { FullNode } from './node'
import { Platform } from './platform'
import {
  ALL_API_NAMESPACES,
  RpcClient,
  RpcIpcAdapter,
  RpcMemoryClient,
  RpcTcpAdapter,
} from './rpc'
import { RpcIpcClient } from './rpc/clients/ipcClient'
import { RpcTcpClient } from './rpc/clients/tcpClient'
import { IronfishSdk } from './sdk'
import { getUniqueTestDataDir } from './testUtilities'
import { Wallet } from './wallet'

describe('IronfishSdk', () => {
  describe('init', () => {
    it('should initialize an SDK', async () => {
      const dataDir = getUniqueTestDataDir()
      const fileSystem = new NodeFileProvider()
      await fileSystem.init()

      const sdk = await IronfishSdk.init({
        configName: 'foo.config.json',
        dataDir: dataDir,
        fileSystem: fileSystem,
      })

      expect(sdk.config).toBeInstanceOf(Config)
      expect(sdk.client).toBeInstanceOf(RpcClient)
      expect(sdk.fileSystem).toBe(fileSystem)

      expect(sdk.config.storage.dataDir).toBe(dataDir)
      expect(sdk.config.storage.configPath).toContain('foo.config.json')
    })

    it('should initialize an SDK/node with correct agent tag', async () => {
      const fileSystem = new NodeFileProvider()
      await fileSystem.init()

      const sdk = await IronfishSdk.init({
        pkg: { name: 'node-app', license: 'MIT', version: '1.0.0', git: 'foo' },
        configName: 'foo.config.json',
        dataDir: getUniqueTestDataDir(),
        fileSystem: fileSystem,
      })

      const node = await sdk.node()

      expect(node.telemetry['defaultTags']).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'agent', value: 'node-app/1.0.0/foo' }),
        ]),
      )
      expect(sdk.config.storage.configPath).toContain('foo.config.json')
    })

    it('should detect platform defaults', async () => {
      const dataDir = getUniqueTestDataDir()
      const sdk = await IronfishSdk.init({ dataDir })
      const runtime = Platform.getRuntime()

      expect(sdk.fileSystem).toBeInstanceOf(NodeFileProvider)
      expect(runtime.type).toBe('node')
    })

    it('should create a node', async () => {
      const fileSystem = new NodeFileProvider()
      await fileSystem.init()

      const sdk = await IronfishSdk.init({
        configName: 'foo.config.json',
        dataDir: getUniqueTestDataDir(),
        fileSystem: fileSystem,
      })

      const node = await sdk.node()

      expect(node).toBeInstanceOf(FullNode)
      expect(node.files).toBe(fileSystem)
      expect(node.config).toBe(sdk.config)
      expect(node.wallet).toBeInstanceOf(Wallet)
    })

    it('should initialize an SDK with the default dataDir if none is passed in', async () => {
      const fileSystem = new NodeFileProvider()
      await fileSystem.init()

      const sdk = await IronfishSdk.init({
        configName: 'foo.config.json',
        fileSystem: fileSystem,
      })

      const expectedDir = fileSystem.resolve(DEFAULT_DATA_DIR)
      expect(sdk.config.dataDir).toBe(expectedDir)
      expect(sdk.config.storage.dataDir).toBe(expectedDir)

      const node = await sdk.node()
      expect(node.config).toBe(sdk.config)
    })
  })

  describe('connectRpc', () => {
    describe('when local is true', () => {
      it('returns and connects `clientMemory` to a node', async () => {
        const sdk = await IronfishSdk.init({
          dataDir: getUniqueTestDataDir(),
        })
        const node = await sdk.node()
        const openDb = jest.spyOn(node, 'openDB').mockImplementationOnce(async () => {})
        jest.spyOn(sdk, 'node').mockResolvedValueOnce(node)

        const client = await sdk.connectRpc(true)

        expect(openDb).toHaveBeenCalledTimes(1)
        expect(client).toBeInstanceOf(RpcMemoryClient)
        const memoryClient = client as RpcMemoryClient
        Assert.isNotUndefined(memoryClient.router)
        expect(memoryClient.router.server.context).toBe(node)
      })
    })

    describe('when local is false', () => {
      it('connects to and returns `RpcIpcClient`', async () => {
        const sdk = await IronfishSdk.init()
        const connect = jest.spyOn(sdk.client, 'connect').mockImplementationOnce(async () => {})

        const client = await sdk.connectRpc(false)

        expect(connect).toHaveBeenCalledTimes(1)
        expect(client).toBeInstanceOf(RpcIpcClient)
        expect(client).toMatchObject(sdk.client)
      })
    })

    describe('when local is false and enableRpcTcp is true', () => {
      it('connects to and returns `RpcTcpClient`', async () => {
        const sdk = await IronfishSdk.init({
          configOverrides: {
            enableRpcTcp: true,
          },
        })

        const connect = jest.spyOn(sdk.client, 'connect').mockImplementationOnce(async () => {})

        const client = await sdk.connectRpc(false)

        expect(connect).toHaveBeenCalledTimes(1)
        expect(client).toBeInstanceOf(RpcTcpClient)
        expect(client).toMatchObject(sdk.client)
      })
    })
  })

  describe('RPC adapters', () => {
    it('should use all RPC namespaces for IPC', async () => {
      const sdk = await IronfishSdk.init({
        dataDir: getUniqueTestDataDir(),
        configOverrides: {
          enableRpcIpc: true,
        },
      })

      const node = await sdk.node()
      const ipc = node.rpc.adapters.find<RpcIpcAdapter>(
        (a): a is RpcIpcAdapter => a instanceof RpcIpcAdapter,
      )

      expect(ipc?.namespaces).toEqual(ALL_API_NAMESPACES)
    })

    it('should use all RPC namespaces for TCP', async () => {
      const sdk = await IronfishSdk.init({
        dataDir: getUniqueTestDataDir(),
        configOverrides: {
          enableRpcTcp: true,
          enableRpcTls: false,
        },
      })

      const node = await sdk.node()
      const tcp = node.rpc.adapters.find<RpcTcpAdapter>(
        (a): a is RpcTcpAdapter => a instanceof RpcTcpAdapter,
      )

      expect(tcp?.namespaces.sort()).toEqual(ALL_API_NAMESPACES.sort())
    })
  })
})
