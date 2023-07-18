/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import os from 'os'
import { createRootLogger } from '../../logger'
import { IronfishSdk } from '../../sdk'
import { ALL_API_NAMESPACES } from '../routes'
import { RpcMemoryClient } from './memoryClient'

describe('MemoryClient', () => {
  it('handles all RPC namespaces', async () => {
    const sdk = await IronfishSdk.init({
      dataDir: os.tmpdir(),
      configOverrides: {
        // TODO: It should be possible to test on the default network (mainnet)
        // once the genesis block has been added.
        networkId: 2,
      },
    })
    const client = new RpcMemoryClient(createRootLogger(), await sdk.node())

    const allowedNamespaces = ALL_API_NAMESPACES
    const loadedNamespaces = [...(client.router?.routes.routes.keys() || [])]
    expect([...allowedNamespaces.values()].sort()).toMatchObject(loadedNamespaces.sort())
  })
})
