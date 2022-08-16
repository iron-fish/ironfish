/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/* eslint-disable jest/no-try-expect */
/* eslint-disable jest/no-conditional-expect */
import os from 'os'
import * as yup from 'yup'
import { IronfishSdk } from '../../sdk'
import { RpcRequestError, RpcSocketClient } from '../clients'
import { ALL_API_NAMESPACES } from '../routes'
import { ERROR_CODES, ValidationError } from './errors'
import { RpcTcpAdapter } from './tcpAdapter'
import { ApiNamespace } from '../routes'

describe('TcpAdapter', () => {
  let tcp: RpcTcpAdapter
  let sdk: IronfishSdk
  let client: RpcSocketClient

  beforeEach(async () => {
    const dataDir = os.tmpdir()

    sdk = await IronfishSdk.init({
      dataDir: dataDir,
      configOverrides: {
        enableRpcTcp: true,
        enableRpcIpc: false,
        enableRpcTls: false
      }
    })

    const node = await sdk.node()

    tcp = node.rpc.adapters[0] as RpcTcpAdapter

    client = sdk.client
  })

  afterEach(async () => {
    client.close()
    await tcp.stop()
  })

  it('should send and receive message', async () => {
    expect(tcp).toBeInstanceOf(RpcTcpAdapter)
    tcp.router?.register('foo/bar', yup.string(), (request) => {
      request.end(request.data)
    })

    await tcp.start()
    await client.connect()

    const response = await client.request<string, void>('foo/bar', 'hello world').waitForEnd()
    expect(response.content).toBe('hello world')
  })

  it('should stream message', async () => {
    tcp.router?.register('foo/bar', yup.object({}), (request) => {
      request.stream('hello 1')
      request.stream('hello 2')
      request.end()
    })

    await tcp.start()
    await client.connect()

    const response = client.request<void, string>('foo/bar')
    expect((await response.contentStream().next()).value).toBe('hello 1')
    expect((await response.contentStream().next()).value).toBe('hello 2')

    await response.waitForEnd()
    expect(response.content).toBe(undefined)
  })

  it('should handle errors', async () => {
    tcp.router?.register('foo/bar', yup.object({}), () => {
      throw new ValidationError('hello error', 402, 'hello-error' as ERROR_CODES)
    })

    await tcp.start()
    await client.connect()

    const response = client.request('foo/bar')

    try {
      expect.assertions(3)
      await response.waitForEnd()
    } catch (error: unknown) {
      if (!(error instanceof RpcRequestError)) {
        throw error
      }
      expect(error.status).toBe(402)
      expect(error.code).toBe('hello-error')
      expect(error.codeMessage).toBe('hello error')
    }
  })

  it('should handle request errors', async () => {
    // Requires this
    const schema = yup.string().defined()
    // But send this instead
    const body = undefined

    tcp.router?.register('foo/bar', schema, (res) => res.end())

    await tcp.start()
    await client.connect()

    const response = client.request('foo/bar', body)

    try {
      expect.assertions(3)
      await response.waitForEnd()
    } catch (error: unknown) {
      if (!(error instanceof RpcRequestError)) {
        throw error
      }
      expect(error.status).toBe(400)
      expect(error.code).toBe(ERROR_CODES.VALIDATION)
      expect(error.codeMessage).toContain('must be defined')
    }
  })

  it('handles only some RPC namespaces by default', async () => {
    const protectedNamespaces = [ApiNamespace.account, ApiNamespace.config]
    const allowedNamespaces = ALL_API_NAMESPACES.filter(namespace => !protectedNamespaces.includes(namespace))
    const loadedNamespaces = [...tcp.router?.routes.keys() || []]
    expect([...allowedNamespaces.values()].sort()).toMatchObject(loadedNamespaces.sort())
  })

  it('allows all namespaces with rpcTcpSecure flag', async () => {
    sdk.config.setOverride('rpcTcpSecure', true)
    const node = await sdk.node()
    const tcp = node.rpc.adapters[0] as RpcTcpAdapter

    const allowedNamespaces = ALL_API_NAMESPACES
    const loadedNamespaces = [...tcp.router?.routes.keys() || []]
    expect([...allowedNamespaces.values()].sort()).toMatchObject(loadedNamespaces.sort())
  })
})
