/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/* eslint-disable jest/no-conditional-expect */
import Mitm from 'mitm'
import net from 'net'
import os from 'os'
import * as yup from 'yup'
import { Assert } from '../../assert'
import { createRootLogger, Logger } from '../../logger'
import { FullNode } from '../../node'
import { IronfishSdk } from '../../sdk'
import { RpcRequestError } from '../clients'
import { RpcTcpClient } from '../clients/tcpClient'
import { ALL_API_NAMESPACES } from '../routes'
import { ERROR_CODES, ValidationError } from './errors'
import { RpcTcpAdapter } from './tcpAdapter'

describe('TcpAdapter', () => {
  let tcp: RpcTcpAdapter | undefined
  let sdk: IronfishSdk
  let client: RpcTcpClient | undefined
  let node: FullNode
  let logger: Logger
  let mitm: ReturnType<typeof Mitm>

  beforeEach(async () => {
    const dataDir = os.tmpdir()
    logger = createRootLogger().withTag('tcpadapter')

    sdk = await IronfishSdk.init({
      dataDir,
      configOverrides: {
        enableRpc: false,
        enableRpcIpc: false,
        enableRpcTcp: false,
        enableRpcTls: false,
        // TODO: It should be possible to test on the default network (mainnet)
        // once the genesis block has been added.
        networkId: 2,
        rpcTcpPort: 0,
      },
      internalOverrides: {
        rpcAuthToken: 'test token',
      },
    })

    node = await sdk.node()

    tcp = new RpcTcpAdapter('localhost', 0, undefined, ALL_API_NAMESPACES)

    mitm = Mitm()
    mitm.on('connection', (socket: net.Socket) => tcp?.onClientConnection(socket))

    await node.rpc.mount(tcp)
  }, 20000)

  afterEach(() => {
    client?.close()
    mitm.disable()
  })

  it('should send and receive message', async () => {
    Assert.isNotUndefined(tcp)
    Assert.isNotNull(tcp.router)

    tcp.router.routes.register('foo/bar', yup.string(), (request) => {
      request.end(request.data)
    })

    client = new RpcTcpClient('localhost', 0)
    await client.connect()

    const response = await client.request('foo/bar', 'hello world').waitForEnd()
    expect(response.content).toBe('hello world')
  }, 20000)

  it('should stream message', async () => {
    Assert.isNotUndefined(tcp)
    Assert.isNotNull(tcp?.router)

    tcp.router.routes.register('foo/bar', yup.object({}), (request) => {
      request.stream('hello 1')
      request.stream('hello 2')
      request.end()
    })

    client = new RpcTcpClient('localhost', 0)
    await client.connect()

    const response = client.request('foo/bar')
    expect((await response.contentStream().next()).value).toBe('hello 1')
    expect((await response.contentStream().next()).value).toBe('hello 2')

    await response.waitForEnd()
    expect(response.content).toBe(undefined)
  }, 20000)

  it('should handle errors', async () => {
    Assert.isNotUndefined(tcp)
    Assert.isNotNull(tcp?.router)

    tcp.router.routes.register('foo/bar', yup.object({}), () => {
      throw new ValidationError('hello error', 402, 'hello-error' as ERROR_CODES)
    })

    client = new RpcTcpClient('localhost', 0)
    await client.connect()

    const response = client.request('foo/bar')

    await expect(response.waitForEnd()).rejects.toThrow(RpcRequestError)
    await expect(response.waitForEnd()).rejects.toMatchObject({
      status: 402,
      code: 'hello-error',
      codeMessage: 'hello error',
    })
  }, 20000)

  it('should handle request errors', async () => {
    Assert.isNotUndefined(tcp)
    Assert.isNotNull(tcp?.router)

    // Requires this
    const schema = yup.string().defined()
    // But send this instead
    const body = undefined

    tcp.router.routes.register('foo/bar', schema, (res) => res.end())

    client = new RpcTcpClient('localhost', 0)
    await client.connect()

    const response = client.request('foo/bar', body)

    await expect(response.waitForEnd()).rejects.toThrow(RpcRequestError)
    await expect(response.waitForEnd()).rejects.toMatchObject({
      status: 400,
      code: ERROR_CODES.VALIDATION,
      codeMessage: expect.stringContaining('this must be defined'),
    })
  }, 20000)

  it('should succeed when authentication pass', async () => {
    Assert.isNotUndefined(tcp)
    tcp.enableAuthentication = true

    Assert.isNotNull(tcp.router)

    tcp.router.routes.register('foo/bar', yup.string(), (request) => {
      request.end(request.data)
    })

    client = new RpcTcpClient('localhost', 0, logger, 'test token')
    await client.connect()

    const response = await client.request('foo/bar', 'hello world').waitForEnd()
    expect(response.content).toBe('hello world')
  }, 20000)

  it('should reject when authentication failed', async () => {
    Assert.isNotUndefined(tcp)
    tcp.enableAuthentication = true

    Assert.isNotNull(tcp.router)

    tcp.router.routes.register('foo/bar', yup.string(), (request) => {
      request.end(request.data)
    })

    client = new RpcTcpClient('localhost', 0, logger, 'wrong token')
    await client.connect()

    const response = client.request('foo/bar', 'hello world')

    await expect(response.waitForEnd()).rejects.toThrow(RpcRequestError)

    await expect(response.waitForEnd()).rejects.toMatchObject({
      status: 401,
      code: ERROR_CODES.UNAUTHENTICATED,
      codeMessage: expect.stringContaining('Failed authentication'),
    })
  }, 20000)

  it('should reject when auth token is empty', async () => {
    Assert.isNotUndefined(tcp)
    tcp.enableAuthentication = true

    Assert.isNotNull(tcp.router)

    tcp.router.routes.register('foo/bar', yup.string(), (request) => {
      request.end(request.data)
    })

    client = new RpcTcpClient('localhost', 0, logger)
    await client.connect()

    const response = client.request('foo/bar', 'hello world')

    await expect(response.waitForEnd()).rejects.toThrow(RpcRequestError)

    await expect(response.waitForEnd()).rejects.toMatchObject({
      status: 401,
      code: ERROR_CODES.UNAUTHENTICATED,
      codeMessage: expect.stringContaining('Missing authentication token'),
    })
  }, 20000)
})
