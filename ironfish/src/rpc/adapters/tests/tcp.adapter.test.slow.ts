/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import Mitm from 'mitm'
import net from 'net'
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { FullNode } from '../../../node'
import { IronfishSdk } from '../../../sdk'
import { RpcClient, RpcRequestError, RpcTcpClient } from '../../clients'
import { ALL_API_NAMESPACES, Router } from '../../routes'
import { IRpcAdapter } from '../adapter'
import { RPC_ERROR_CODES } from '../errors'
import { RpcTcpAdapter } from '../tcpAdapter'
import { createAdapterTest } from './adapterTest'

describe('TlsAdapter', () => {
  let mitm: ReturnType<typeof Mitm>
  let client: RpcTcpClient
  let adapter: RpcTcpAdapter
  let router: Router

  async function onSetup(
    sdk: IronfishSdk,
    node: FullNode,
  ): Promise<{
    client: RpcClient
    router: Router
    adapter: IRpcAdapter
  }> {
    node.internal.set('rpcAuthToken', 'test token')

    adapter = new RpcTcpAdapter('localhost', 0, undefined, ALL_API_NAMESPACES)
    mitm = Mitm()
    mitm.on('connection', (socket: net.Socket) => adapter.onClientConnection(socket))
    await node.rpc.mount(adapter)
    await adapter.start()

    Assert.isNotNull(adapter.router)
    router = adapter.router

    client = new RpcTcpClient('localhost', 0)

    return {
      client,
      adapter,
      router,
    }
  }

  async function onTeardown() {
    await adapter.stop()
    mitm.disable()
  }

  async function onConnect() {
    await client.connect()
  }

  function onDisconnect() {
    client.close()
  }

  createAdapterTest(onSetup, onTeardown, onConnect, onDisconnect)

  it('should succeed when authentication pass', async () => {
    adapter.enableAuthentication = true

    router.routes.register('foo/bar', yup.string(), (request) => {
      request.end(request.data)
    })

    const client = new RpcTcpClient('localhost', 0, undefined, 'test token')
    await client.connect()

    const response = await client.request('foo/bar', 'hello world').waitForEnd()
    expect(response.content).toBe('hello world')
  })

  it('should reject when authentication failed', async () => {
    adapter.enableAuthentication = true

    router.routes.register('foo/bar', yup.string(), (request) => {
      request.end(request.data)
    })

    client = new RpcTcpClient('localhost', 0, undefined, 'wrong token')
    await client.connect()

    const response = client.request('foo/bar', 'hello world')

    await expect(response.waitForEnd()).rejects.toThrow(RpcRequestError)

    await expect(response.waitForEnd()).rejects.toMatchObject({
      status: 401,
      code: RPC_ERROR_CODES.UNAUTHENTICATED,
      codeMessage: expect.stringContaining('Failed authentication'),
    })
  }, 20000)

  it('should reject when auth token is empty', async () => {
    adapter.enableAuthentication = true

    router.routes.register('foo/bar', yup.string(), (request) => {
      request.end(request.data)
    })

    client = new RpcTcpClient('localhost', 0, undefined)
    await client.connect()

    const response = client.request('foo/bar', 'hello world')

    await expect(response.waitForEnd()).rejects.toThrow(RpcRequestError)

    await expect(response.waitForEnd()).rejects.toMatchObject({
      status: 401,
      code: RPC_ERROR_CODES.UNAUTHENTICATED,
      codeMessage: expect.stringContaining('Missing authentication token'),
    })
  })
})
