/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CliUx } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export class PostCommand extends IronfishCommand {
  static summary = 'Post a raw transaction'

  static description = `Use this command to post a raw transaction.

  The output is a finalized posted transaction. The transaction is also added to the wallet, and sent out to the network.`

  static examples = [
    '$ ironfish wallet:post 618c098d8d008c9f78f6155947014901a019d9ec17160dc0f0d1bb1c764b29b4...',
  ]

  static flags = {
    ...RemoteFlags,
  }

  static args = [
    {
      name: 'transaction',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      description: 'The raw transaction in hex encoding',
    },
  ]

  async start(): Promise<void> {
    const { args } = await this.parse(PostCommand)
    const transaction = args.transaction as string

    CliUx.ux.action.start(`Posting transaction`)
    const client = await this.sdk.connectRpc()
    const response = await client.postTransaction({ transaction })
    CliUx.ux.action.stop()

    this.log(response.content.transaction)
  }
}
