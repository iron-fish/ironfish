/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/* eslint-disable jest/no-conditional-expect */
import Mitm from 'mitm'
import * as yup from 'yup'
import { Assert } from '../../assert'
import { createNodeTest } from '../../testUtilities'
import { RpcHttpClient, RpcRequestError } from '../clients'
import { ALL_API_NAMESPACES } from '../routes'
import { RPC_ERROR_CODES, RpcValidationError } from './errors'
import { RpcHttpAdapter } from './httpAdapter'

describe('HttpAdapter', () => {
  let httpAdapter: RpcHttpAdapter | undefined
  let mitm: ReturnType<typeof Mitm>

  const nodeTest = createNodeTest(false, {
    config: {
      enableRpc: false,
      enableRpcIpc: false,
      enableRpcTcp: false,
      enableRpcTls: false,
      rpcHttpPort: 0,
    },
  })

  beforeEach(async () => {
    httpAdapter = new RpcHttpAdapter('localhost', 0, undefined, ALL_API_NAMESPACES)

    mitm = Mitm()
    mitm.on('request', (req, res) => httpAdapter?.onRequest(req, res))

    await nodeTest.node.rpc.mount(httpAdapter)
  }, 20000)

  afterEach(() => {
    mitm.disable()
  })

  it('should send and receive message', async () => {
    Assert.isNotUndefined(httpAdapter)
    Assert.isNotNull(httpAdapter.router)

    httpAdapter.router.routes.register('foo/bar', yup.string(), (request) => {
      request.end(request.data)
    })

    const client = new RpcHttpClient('http://localhost')

    const response = await client.request('foo/bar', 'hello world').waitForEnd()
    expect(response.content).toBe('hello world')
  }, 20000)

  it('should stream message', async () => {
    Assert.isNotUndefined(httpAdapter)
    Assert.isNotNull(httpAdapter?.router)

    httpAdapter.router.routes.register('foo/bar', yup.object({}), (request) => {
      request.stream('hello 1')
      request.stream('hello 2')
      request.end()
    })

    const client = new RpcHttpClient('http://localhost')

    const response = client.request('foo/bar')
    expect((await response.contentStream().next()).value).toBe('hello 1')
    expect((await response.contentStream().next()).value).toBe('hello 2')

    await response.waitForEnd()
    expect(response.content).toBe(undefined)
  }, 20000)

  it('should handle errors', async () => {
    Assert.isNotUndefined(httpAdapter)
    Assert.isNotNull(httpAdapter?.router)

    httpAdapter.router.routes.register('foo/bar', yup.object({}), () => {
      throw new RpcValidationError('hello error', 402, 'hello-error' as RPC_ERROR_CODES)
    })

    const client = new RpcHttpClient('http://localhost')

    const response = client.request('foo/bar')

    await expect(response.waitForEnd()).rejects.toThrow(RpcRequestError)
    await expect(response.waitForEnd()).rejects.toMatchObject({
      status: 402,
      code: 'hello-error',
      codeMessage: 'hello error',
    })
  }, 20000)

  it('should handle request errors', async () => {
    Assert.isNotUndefined(httpAdapter)
    Assert.isNotNull(httpAdapter?.router)

    // Requires this
    const schema = yup.string().defined()
    // But send this instead
    const body = undefined

    httpAdapter.router.routes.register('foo/bar', schema, (res) => res.end())

    const client = new RpcHttpClient('http://localhost')

    const response = client.request('foo/bar', body)

    await expect(response.waitForEnd()).rejects.toThrow(RpcRequestError)
    await expect(response.waitForEnd()).rejects.toMatchObject({
      status: 400,
      code: RPC_ERROR_CODES.VALIDATION,
      codeMessage: expect.stringContaining('this must be defined'),
    })
  }, 20000)
})
