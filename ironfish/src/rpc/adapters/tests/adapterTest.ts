/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { FullNode } from '../../../node'
import {
  IRpcAdapter,
  Router,
  RPC_ERROR_CODES,
  RpcClient,
  RpcRequestError,
  RpcValidationError,
} from '../../../rpc'
import { IronfishSdk } from '../../../sdk'
import { createNodeTest } from '../../../testUtilities'
import { PromiseUtils } from '../../../utils/promise'

export function createAdapterTest(
  onSetup: (
    sdk: IronfishSdk,
    node: FullNode,
  ) => Promise<{
    client: RpcClient
    router: Router
    adapter: IRpcAdapter
  }>,
  onTeardown: () => void | Promise<void>,
  onConnect: () => void | Promise<void>,
  onDisconnect: () => void,
): void {
  let client: RpcClient
  let router: Router
  let adapter: IRpcAdapter

  const nodeTest = createNodeTest(false, {
    config: {
      enableRpc: false,
      enableRpcIpc: false,
      enableRpcTcp: false,
      enableRpcTls: false,
      enableRpcHttp: false,
    },
  })

  beforeEach(async () => {
    // eslint-disable-next-line @typescript-eslint/no-extra-semi
    ;({ client, router, adapter } = await onSetup(nodeTest.sdk, nodeTest.node))
    await onConnect()
  })

  afterEach(async () => {
    onDisconnect()
    await onTeardown()
  })

  it('adapter should start and stop', async () => {
    await adapter.stop()
    expect(adapter.started).toBe(false)

    await adapter.start()
    expect(adapter.started).toBe(true)

    await adapter.stop()
    expect(adapter.started).toBe(false)
  })

  it('should send and receive message', async () => {
    router.routes.register('foo/bar', yup.string(), (request) => {
      request.end(request.data)
    })

    const response = await client.request('foo/bar', 'hello world').waitForEnd()
    expect(response.content).toBe('hello world')
  })

  it('should stream message', async () => {
    router.routes.register('foo/bar', yup.object({}), (request) => {
      request.stream('hello 1')
      request.stream('hello 2')
      request.end()
    })

    const response = client.request('foo/bar')
    expect((await response.contentStream().next()).value).toBe('hello 1')
    expect((await response.contentStream().next()).value).toBe('hello 2')

    await response.waitForEnd()
    expect(response.content).toBe(undefined)
  })

  it('should not crash on disconnect while streaming', async () => {
    const [waitPromise, waitResolve] = PromiseUtils.split<void>()

    router.routes.register('foo/bar', yup.object({}), () => waitPromise)
    const next = client.request('foo/bar').contentStream().next()

    onDisconnect()
    waitResolve()

    expect.assertions(0)
    await next
  })

  it('should handle errors', async () => {
    router.routes.register('foo/bar', yup.object({}), () => {
      throw new RpcValidationError('hello error', 402, 'hello-error' as RPC_ERROR_CODES)
    })

    const response = client.request('foo/bar')

    await expect(response.waitForEnd()).rejects.toThrow(RpcRequestError)
    await expect(response.waitForEnd()).rejects.toMatchObject({
      status: 402,
      code: 'hello-error',
      codeMessage: 'hello error',
    })
  })

  it('should handle request errors', async () => {
    // Requires this
    const schema = yup.string().defined()
    // But send this instead
    const body = undefined

    router.routes.register('foo/bar', schema, (res) => res.end())

    const response = client.request('foo/bar', body)

    await expect(response.waitForEnd()).rejects.toThrow(RpcRequestError)
    await expect(response.waitForEnd()).rejects.toMatchObject({
      status: 400,
      code: RPC_ERROR_CODES.VALIDATION,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      codeMessage: expect.stringContaining('this must be defined'),
    })
  })
}
