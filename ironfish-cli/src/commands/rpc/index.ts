/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export class ListRpcCommand extends IronfishCommand {
  static aliases = ['rpc:list']
  static description = `List all the rpc methods mounted on the node`

  static flags = {
    ...RemoteFlags,
  }

  static args = [
    {
      name: 'namespace',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: false,
      description: 'The namespace to get methods for',
    },
  ]

  async start(): Promise<void> {
    const { args } = await this.parse(ListRpcCommand)
    const namespace = args.namespace as string | undefined

    const client = await this.sdk.connectRpc()

    const response = await client.getRpcMethods({ namespace: namespace })

    if (response.content.ipc.length === 0 && response.content.rpc.length === 0) {
      this.log('No rpc methods mounted!')
    }

    this.log('IPC methods:')
    for (const name of response.content.ipc) {
      this.log(name)
    }
    this.log('')

    this.log('Socket RPC methods:')
    for (const name of response.content.rpc) {
      this.log(name)
    }
  }
}
