/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ApiNamespace, IronfishSdk, RpcClient, RpcMemoryClient } from '@ironfish/sdk'

export async function connectRpcConfig(
  sdk: IronfishSdk,
  forceLocal = false,
  forceRemote = false,
): Promise<Pick<RpcClient, 'config'>> {
  forceRemote = forceRemote || sdk.config.get('enableRpcTcp')

  if (!forceLocal) {
    if (forceRemote) {
      await sdk.client.connect()
      return sdk.client
    }

    const connected = await sdk.client.tryConnect()
    if (connected) {
      return sdk.client
    }
  }

  // This connection uses a wallet node since that is the most granular type
  // of node available. This can be refactored in the future if needed.
  const node = await sdk.walletNode({ connectNodeClient: false })
  const clientMemory = new RpcMemoryClient(
    sdk.logger,
    node.rpc.getRouter([ApiNamespace.config]),
  )
  return clientMemory
}
