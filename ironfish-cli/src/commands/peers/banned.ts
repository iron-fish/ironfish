/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BannedPeerResponse, GetBannedPeersResponse, PromiseUtils } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import blessed from 'blessed'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

const tableFlags = CliUx.ux.table.flags()

export class BannedCommand extends IronfishCommand {
  static description = `List all banned peers`

  static flags = {
    ...RemoteFlags,
    ...tableFlags,
    follow: Flags.boolean({
      char: 'f',
      default: false,
      description: 'Follow the banned peers list live',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(BannedCommand)

    if (!flags.follow) {
      await this.sdk.client.connect()
      const response = await this.sdk.client.peer.getBannedPeers()
      this.log(renderTable(response.content))
      this.exit(0)
    }

    if (flags.sort !== undefined) {
      this.log('The `sort` flag is not supported when using the `follow` flag.')
    }

    // Console log will create display issues with Blessed
    this.logger.pauseLogs()

    const screen = blessed.screen({ smartCSR: true, fullUnicode: true })
    const text = blessed.text()
    screen.append(text)

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const connected = await this.sdk.client.tryConnect()
      if (!connected) {
        text.clearBaseLine(0)
        text.setContent('Connecting...')
        screen.render()
        await PromiseUtils.sleep(1000)
        continue
      }

      const response = this.sdk.client.peer.getBannedPeersStream()

      for await (const value of response.contentStream()) {
        text.clearBaseLine(0)
        text.setContent(renderTable(value))
        screen.render()
      }
    }
  }
}

function renderTable(content: GetBannedPeersResponse): string {
  const columns: CliUx.Table.table.Columns<BannedPeerResponse> = {
    identity: {
      minWidth: 45,
      header: 'IDENTITY',
      get: (row) => {
        return row.identity
      },
    },
    reason: {
      minWidth: 15,
      header: 'BAN REASON',
      get: (row) => {
        return row.reason
      },
    },
  }

  let result = ''

  CliUx.ux.table(content.peers, columns, {
    printLine: (line) => (result += `${String(line)}\n`),
  })

  return result
}
