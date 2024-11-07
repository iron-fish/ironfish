/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import Mitm from 'mitm'
import { Assert } from '../../../assert'
import { FullNode } from '../../../node'
import { IronfishSdk } from '../../../sdk'
import { RpcClient, RpcHttpClient } from '../../clients'
import { ALL_API_NAMESPACES, Router } from '../../routes'
import { IRpcAdapter } from '../adapter'
import { RpcHttpAdapter } from '../httpAdapter'
import { createAdapterTest } from './adapterTest'

describe('HttpAdapter', () => {
  let mitm: ReturnType<typeof Mitm>
  let client: RpcHttpClient
  let adapter: RpcHttpAdapter
  let router: Router

  async function onSetup(
    sdk: IronfishSdk,
    node: FullNode,
  ): Promise<{
    client: RpcClient
    router: Router
    adapter: IRpcAdapter
  }> {
    adapter = new RpcHttpAdapter('localhost', 0, undefined, ALL_API_NAMESPACES)
    mitm = Mitm()
    mitm.on('request', (req, res) => adapter.onRequest(req, res))
    await node.rpc.mount(adapter)
    await adapter.start()

    Assert.isNotNull(adapter.router)
    router = adapter.router

    client = new RpcHttpClient('http://localhost')

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

  function onConnect() {}

  function onDisconnect() {
    client.close()
  }

  createAdapterTest(onSetup, onTeardown, onConnect, onDisconnect)
})
