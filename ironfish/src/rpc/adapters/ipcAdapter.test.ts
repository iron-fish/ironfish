/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/* eslint-disable jest/no-try-expect */
/* eslint-disable jest/no-conditional-expect */
import os from 'os'
import * as yup from 'yup'
import { IronfishSdk } from '../../sdk'
import { IronfishIpcClient, RequestError } from '../clients'
import { ALL_API_NAMESPACES } from '../routes'
import { ERROR_CODES, ValidationError } from './errors'
import { IpcAdapter } from './ipcAdapter'

describe('IpcAdapter', () => {
  let ipc: IpcAdapter
  let sdk: IronfishSdk
  let client: IronfishIpcClient

  beforeEach(async () => {
    const dataDir = os.tmpdir()

    sdk = await IronfishSdk.init({ dataDir })
    sdk.config.setOverride('enableRpc', false)
    sdk.config.setOverride('enableRpcIpc', false)

    const node = await sdk.node()
    ipc = new IpcAdapter(ALL_API_NAMESPACES, {
      mode: 'ipc',
      socketPath: sdk.config.get('ipcPath'),
    })

    await node.rpc.mount(ipc)

    client = sdk.client
  })

  afterEach(async () => {
    client.close()
    await ipc.stop()
  })

  it('should start and stop', async () => {
    expect(ipc.started).toBe(false)

    await ipc.start()
    expect(ipc.started).toBe(true)

    await ipc.stop()
    expect(ipc.started).toBe(true)
  })

  it('should send and receive message', async () => {
    ipc.router?.register('foo/bar', yup.string(), (request) => {
      request.end(request.data)
    })

    await ipc.start()
    await client.connect()

    const response = await client.request<string, void>('foo/bar', 'hello world').waitForEnd()
    expect(response.content).toBe('hello world')
  })

  it('should stream message', async () => {
    ipc.router?.register('foo/bar', yup.object({}), (request) => {
      request.stream('hello 1')
      request.stream('hello 2')
      request.end()
    })

    await ipc.start()
    await client.connect()

    const response = client.request<void, string>('foo/bar')
    expect((await response.contentStream().next()).value).toBe('hello 1')
    expect((await response.contentStream().next()).value).toBe('hello 2')

    await response.waitForEnd()
    expect(response.content).toBe(undefined)
  })

  it('should handle errors', async () => {
    ipc.router?.register('foo/bar', yup.object({}), () => {
      throw new ValidationError('hello error', 402, 'hello-error' as ERROR_CODES)
    })

    await ipc.start()
    await client.connect()

    const response = client.request('foo/bar')

    try {
      expect.assertions(3)
      await response.waitForEnd()
    } catch (error: unknown) {
      if (!(error instanceof RequestError)) {
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

    ipc.router?.register('foo/bar', schema, (res) => res.end())

    await ipc.start()
    await client.connect()

    const response = client.request('foo/bar', body)

    try {
      expect.assertions(3)
      await response.waitForEnd()
    } catch (error: unknown) {
      if (!(error instanceof RequestError)) {
        throw error
      }
      expect(error.status).toBe(400)
      expect(error.code).toBe(ERROR_CODES.VALIDATION)
      expect(error.codeMessage).toContain('must be defined')
    }
  })
})
