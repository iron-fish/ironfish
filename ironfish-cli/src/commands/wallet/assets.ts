/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BufferUtils } from '@ironfish/sdk'
import { CliUx } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export class AssetsCommand extends IronfishCommand {
  static description = `Display the wallet's assets`

  static flags = {
    ...RemoteFlags,
    ...CliUx.ux.table.flags(),
  }

  static args = [
    {
      name: 'account',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: false,
      description: 'Name of the account',
    },
  ]

  async start(): Promise<void> {
    const { flags, args } = await this.parse(AssetsCommand)
    const account = args.account as string | undefined

    const client = await this.sdk.connectRpc()
    const response = client.getAssets({
      account,
    })

    let showHeader = true

    for await (const asset of response.contentStream()) {
      CliUx.ux.table(
        [asset],
        {
          name: {
            header: 'Name',
            minWidth: 16,
            get: (row) => BufferUtils.toHuman(Buffer.from(row.name, 'hex')),
          },
          id: {
            header: 'ID',
          },
          metadata: {
            header: 'Metadata',
            get: (row) => BufferUtils.toHuman(Buffer.from(row.metadata, 'hex')),
          },
          supply: {
            header: 'Supply',
            minWidth: 16,
            get: (row) => row.supply ?? 'NULL',
          },
          owner: {
            header: 'Owner',
            get: (row) => (row.owner ? `✔` : `x`),
          },
          pending: {
            header: 'Pending',
            get: (row) => (row.pending ? `✔` : `x`),
          },
        },
        {
          printLine: this.log.bind(this),
          ...flags,
          'no-header': !showHeader,
        },
      )

      showHeader = false
    }
  }
}
