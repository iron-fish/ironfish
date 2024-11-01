/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BannedPeerResponse, GetBannedPeersResponse, PromiseUtils } from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import blessed from 'blessed'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { table, TableColumns, TableFlags } from '../../ui'

const { sort, ...tableFlags } = TableFlags

export class BannedCommand extends IronfishCommand {
  static description = `list banned peers`

  static flags = {
    ...RemoteFlags,
    ...tableFlags,
    sort: {
      ...sort,
      exclusive: ['follow'],
    } as typeof sort,
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
      this.log(renderTable(response.content, flags.limit))
      this.exit(0)
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
        text.setContent(renderTable(value, flags.limit))
        screen.render()
      }
    }
  }
}

function renderTable(content: GetBannedPeersResponse, limit: number): string {
  const columns: TableColumns<BannedPeerResponse> = {
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

  table(content.peers, columns, {
    limit,
    printLine: (line) => (result += `${String(line)}\n`),
  })

  return result
}
