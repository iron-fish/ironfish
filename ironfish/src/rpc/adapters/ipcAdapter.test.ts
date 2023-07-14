/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import os from 'os'
import * as yup from 'yup'
import { Assert } from '../../assert'
import { IronfishSdk } from '../../sdk'
import { PromiseUtils } from '../../utils/promise'
import { RpcRequestError } from '../clients'
import { RpcIpcClient } from '../clients/ipcClient'
import { ALL_API_NAMESPACES } from '../routes/router'
import { ERROR_CODES, ValidationError } from './errors'
import { RpcIpcAdapter } from './ipcAdapter'

describe('IpcAdapter', () => {
  let ipc: RpcIpcAdapter
  let sdk: IronfishSdk
  let client: RpcIpcClient

  beforeEach(async () => {
    const dataDir = os.tmpdir()

    sdk = await IronfishSdk.init({
      dataDir,
      configOverrides: {
        enableRpc: false,
        enableRpcIpc: false,
        // TODO: It should be possible to test on the default network (mainnet)
        // once the genesis block has been added.
        networkId: 2,
      },
    })

    ipc = new RpcIpcAdapter(sdk.config.get('ipcPath'), undefined, ALL_API_NAMESPACES)

    const node = await sdk.node()
    await node.rpc.mount(ipc)

    Assert.isInstanceOf(sdk.client, RpcIpcClient)
    client = sdk.client
  })

  afterEach(async () => {
    client.close()
    await ipc.stop()
  })

  it('should start and stop', async () => {
    expect(ipc).toBeInstanceOf(RpcIpcAdapter)
    expect(ipc.started).toBe(false)

    await ipc.start()
    expect(ipc.started).toBe(true)

    await ipc.stop()
    expect(ipc.started).toBe(false)
  })

  it('should send and receive message', async () => {
    ipc.router?.routes.register('foo/bar', yup.string(), (request) => {
      request.end(request.data)
    })

    await ipc.start()
    await client.connect()

    const response = await client.request('foo/bar', 'hello world').waitForEnd()
    expect(response.content).toBe('hello world')
  })

  it('should stream message', async () => {
    ipc.router?.routes.register('foo/bar', yup.object({}), (request) => {
      request.stream('hello 1')
      request.stream('hello 2')
      request.end()
    })

    await ipc.start()
    await client.connect()

    const response = client.request('foo/bar')
    expect((await response.contentStream().next()).value).toBe('hello 1')
    expect((await response.contentStream().next()).value).toBe('hello 2')

    await response.waitForEnd()
    expect(response.content).toBe(undefined)
  })

  it('should not crash on disconnect while streaming', async () => {
    const [waitPromise, waitResolve] = PromiseUtils.split<void>()

    ipc.router?.routes.register('foo/bar', yup.object({}), async () => {
      await waitPromise
    })

    await ipc.start()
    await client.connect()

    const next = client.request('foo/bar').contentStream().next()

    client.close()
    waitResolve()

    expect.assertions(0)
    await next
  })

  it('should handle errors', async () => {
    ipc.router?.routes.register('foo/bar', yup.object({}), () => {
      throw new ValidationError('hello error', 402, 'hello-error' as ERROR_CODES)
    })

    await ipc.start()
    await client.connect()

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

    ipc.router?.routes.register('foo/bar', schema, (res) => res.end())

    await ipc.start()
    await client.connect()

    const response = client.request('foo/bar', body)

    await expect(response.waitForEnd()).rejects.toThrow(RpcRequestError)
    await expect(response.waitForEnd()).rejects.toMatchObject({
      status: 400,
      code: ERROR_CODES.VALIDATION,
      codeMessage: expect.stringContaining('this must be defined'),
    })
  })
})
