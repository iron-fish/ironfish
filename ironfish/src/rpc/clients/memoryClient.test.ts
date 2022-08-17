/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { createRootLogger } from '../../logger'
import { IronfishSdk } from '../../sdk'
import { ALL_API_NAMESPACES } from '../routes'
import { RpcMemoryClient } from './memoryClient'

describe('MemoryClient', () => {
  it('handles all RPC namespaces', async () => {
    const sdk = await IronfishSdk.init()
    const client = new RpcMemoryClient(createRootLogger(), await sdk.node())

    const allowedNamespaces = ALL_API_NAMESPACES
    const loadedNamespaces = [...(client.router?.routes.keys() || [])]
    expect([...allowedNamespaces.values()].sort()).toMatchObject(loadedNamespaces.sort())
  })
})
