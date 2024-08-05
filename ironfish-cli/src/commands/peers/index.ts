/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { GetPeersResponse, PromiseUtils } from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { Interfaces } from '@oclif/core'
import blessed from 'blessed'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { table, TableColumns, TableFlags } from '../../ui'

type GetPeerResponsePeer = GetPeersResponse['peers'][0]

const STATE_COLUMN_HEADER = 'STATE'

export class ListCommand extends IronfishCommand {
  static description = 'list network peers'

  static flags = {
    ...RemoteFlags,
    ...TableFlags,
    follow: Flags.boolean({
      char: 'f',
      default: false,
      description: 'Follow the peers list live',
    }),
    all: Flags.boolean({
      default: false,
      description: 'Show all peers, not just connected peers',
    }),
    agents: Flags.boolean({
      char: 'a',
      default: false,
      description: 'Display peer agents',
    }),
    sequence: Flags.boolean({
      char: 's',
      default: false,
      description: 'Display peer head sequence',
    }),
    names: Flags.boolean({
      char: 'n',
      default: false,
      description: 'Display node names',
    }),
    features: Flags.boolean({
      default: false,
      description: 'Display features that the peers have enabled',
    }),
    host: Flags.string({
      description: 'Only show peers matching the given host',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(ListCommand)
    flags.sort = flags.sort ?? STATE_COLUMN_HEADER

    if (!flags.follow) {
      await this.sdk.client.connect()
      const response = await this.sdk.client.peer.getPeers()
      this.log(renderTable(response.content, flags))
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

      const response = this.sdk.client.peer.getPeersStream()

      for await (const value of response.contentStream()) {
        text.clearBaseLine(0)
        text.setContent(renderTable(value, flags))
        screen.render()
      }
    }
  }
}

function renderTable(
  content: GetPeersResponse,
  flags: Interfaces.InferredFlags<typeof ListCommand.flags>,
): string {
  let columns: TableColumns<GetPeerResponsePeer> = {
    identity: {
      header: 'IDENTITY',
      get: (row: GetPeerResponsePeer) => {
        return row.identity || '-'
      },
    },
  }

  if (flags.names) {
    columns['name'] = {
      header: 'NAME',
      minWidth: 5,
      get: (row: GetPeerResponsePeer) => {
        return row.name || '-'
      },
    }
  }

  if (flags.agents) {
    columns['agents'] = {
      header: 'AGENT',
      minWidth: 5,
      get: (row: GetPeerResponsePeer) => {
        return row.agent || '-'
      },
    }
  }

  if (flags.sequence) {
    columns['sequence'] = {
      header: 'SEQ',
      minWidth: 2,
      get: (row: GetPeerResponsePeer) => {
        return row.sequence || '-'
      },
    }
  }

  if (flags.features) {
    columns['features'] = {
      header: 'FEATURES',
      minWidth: 2,
      get: (row: GetPeerResponsePeer) => {
        if (!row.features) {
          return ''
        }

        return Object.entries(row.features)
          .map(([k, v]) => {
            return v ? k : null
          })
          .filter(Boolean)
          .sort()
          .join(',')
      },
    }
  }

  columns = {
    ...columns,
    state: {
      header: STATE_COLUMN_HEADER,
      minWidth: 15,
      get: (row: GetPeerResponsePeer) => {
        return row.state + (row.error ? '(!)' : '')
      },
    },
    address: {
      header: 'ADDRESS',
      minWidth: 7,
      get: (row: GetPeerResponsePeer) => {
        let address = ''
        if (row.address) {
          address += row.address
        }
        if (row.port) {
          address += ':' + String(row.port)
        }
        return address
      },
    },
    connectionDirection: {
      header: 'DIRECTION',
      minWidth: 5,
      extended: true,
      get: (row: GetPeerResponsePeer) => {
        return row.connectionDirection || '-'
      },
    },
    connectionWebSocket: {
      header: 'SOCKET',
      minWidth: 4,
      extended: true,
      get: (row: GetPeerResponsePeer) => {
        return row.connectionWebSocket + (row.connectionWebSocketError ? ' (!)' : '') || '-'
      },
    },
    connectionWebRTC: {
      header: 'RTC',
      minWidth: 5,
      extended: true,
      get: (row: GetPeerResponsePeer) => {
        return row.connectionWebRTC + (row.connectionWebRTCError ? ' (!)' : '') || '-'
      },
    },
    error: {
      header: 'ERROR',
      minWidth: 5,
      extended: true,
      get: (row: GetPeerResponsePeer) => {
        return row.error || '-'
      },
    },
  }

  let peers = content.peers

  if (!flags.all) {
    peers = peers.filter((p) => p.state === 'CONNECTED')
  }

  if (flags.host) {
    peers = peers.filter((p) => p.address?.includes(flags.host || ''))
  }

  let result = ''

  table(peers, columns, {
    printLine: (line) => (result += `${String(line)}\n`),
    ...flags,
  })

  return result
}
