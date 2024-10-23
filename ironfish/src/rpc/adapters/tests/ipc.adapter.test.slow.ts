/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../../../assert'
import { FullNode } from '../../../node'
import { ALL_API_NAMESPACES, IRpcAdapter, Router, RpcClient, RpcIpcAdapter } from '../../../rpc'
import { IronfishSdk } from '../../../sdk'
import { RpcIpcClient } from '../../clients/ipcClient'
import { createAdapterTest } from './adapterTest'

describe('IpcAdapter', () => {
  let adapter: RpcIpcAdapter
  let client: RpcIpcClient

  async function onSetup(
    sdk: IronfishSdk,
    node: FullNode,
  ): Promise<{
    client: RpcClient
    router: Router
    adapter: IRpcAdapter
  }> {
    adapter = new RpcIpcAdapter(sdk.config.get('ipcPath'), undefined, ALL_API_NAMESPACES)
    await node.rpc.mount(adapter)
    await adapter.start()
    Assert.isNotNull(adapter.router)

    client = new RpcIpcClient(sdk.config.get('ipcPath'))

    return {
      client,
      router: adapter.router,
      adapter: adapter,
    }
  }

  async function onTeardown() {
    await adapter.stop()
  }

  async function onConnect() {
    await client.connect()
  }

  function onDisconnect() {
    client.close()
  }

  createAdapterTest(onSetup, onTeardown, onConnect, onDisconnect)
})
