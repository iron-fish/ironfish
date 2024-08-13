/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { FileUtils, GetRpcStatusResponse, PromiseUtils } from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import blessed from 'blessed'
import { IronfishCommand } from '../../command'
import { JsonFlags, RemoteFlags } from '../../flags'
import * as ui from '../../ui'

export default class Status extends IronfishCommand {
  static description = "show RPC server's status"
  static enableJsonFlag = true

  static flags = {
    ...RemoteFlags,
    ...JsonFlags,
    follow: Flags.boolean({
      char: 'f',
      default: false,
      description: 'Follow the status of the node live',
    }),
  }

  async start(): Promise<unknown> {
    const { flags } = await this.parse(Status)

    if (!flags.follow) {
      const client = await this.connectRpc()
      const response = await client.rpc.getRpcStatus()
      this.log(renderStatus(response.content))

      return response.content
    }

    // Console log will create display issues with Blessed
    this.logger.pauseLogs()

    const screen = blessed.screen({ smartCSR: true })
    const statusText = blessed.text()
    screen.append(statusText)

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const connected = await this.sdk.client.tryConnect()

      if (!connected) {
        statusText.clearBaseLine(0)
        statusText.setContent('Node: STOPPED')
        screen.render()
        await PromiseUtils.sleep(1000)
        continue
      }

      const response = this.sdk.client.rpc.getRpcStatusStream()
      for await (const value of response.contentStream()) {
        statusText.setContent(renderStatus(value))
        screen.render()
      }
    }
  }
}

function renderStatus(content: GetRpcStatusResponse): string {
  let result = `STARTED: ${String(content.started)}`

  for (const adapter of content.adapters) {
    result += `\n\n[${adapter.name}]\n`
    result += ui.card({
      Clients: adapter.clients,
      'Requests Pending': adapter.pending.length,
      'Routes Pending': adapter.pending.join(', '),
      'Inbound Traffic': FileUtils.formatMemorySize(adapter.inbound),
      'Outbound Traffic': FileUtils.formatMemorySize(adapter.outbound),
      'Outbound Total': FileUtils.formatMemorySize(adapter.writtenBytes),
      'Inbound Total': FileUtils.formatMemorySize(adapter.readBytes),
      'RW Backlog': `${FileUtils.formatMemorySize(
        adapter.readableBytes,
      )} / ${FileUtils.formatMemorySize(adapter.writableBytes)}`,
    })
  }

  return result
}
