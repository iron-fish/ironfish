/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ConfigOptions, IronfishSdk, NodeFileProvider } from 'ironfish'
import { RPC_HOST, RPC_MODE, RPC_PORT } from '../config'

export class RPCClient {
  sdk: IronfishSdk

  private constructor(sdk: IronfishSdk) {
    this.sdk = sdk
  }
  static async init(): Promise<RPCClient> {
    const fileSystem = new NodeFileProvider()
    await fileSystem.init()

    const configOverrides: Partial<ConfigOptions> = {}
    configOverrides.logLevel = '*:verbose'
    configOverrides.enableRpcTcp = RPC_MODE === 'tcp'
    configOverrides.rpcTcpHost = RPC_HOST
    configOverrides.rpcTcpPort = Number(RPC_PORT)

    const sdk = await IronfishSdk.init({
      configOverrides: configOverrides,
    })

    return new RPCClient(sdk)
  }
}
