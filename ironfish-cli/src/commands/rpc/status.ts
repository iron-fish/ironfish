/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { FileUtils, GetRpcStatusResponse, PromiseUtils } from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import blessed from 'blessed'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export default class Status extends IronfishCommand {
  static description = 'Show the status of the RPC layer'

  static flags = {
    ...RemoteFlags,
    follow: Flags.boolean({
      char: 'f',
      default: false,
      description: 'follow the status of the node live',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(Status)

    if (!flags.follow) {
      const client = await this.sdk.connectRpc()
      const response = await client.getRpcStatus()
      this.log(renderStatus(response.content))
      this.exit(0)
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

      const response = this.sdk.client.getRpcStatusStream()
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
    result += `Clients:          ${adapter.clients}\n`
    result += `Requests Pending: ${adapter.pending}\n`
    result += `Inbound Traffic:  ${FileUtils.formatMemorySize(adapter.inbound)}/s\n`
    result += `Outbound Traffic: ${FileUtils.formatMemorySize(adapter.outbound)}/s\n`
    result += `Outbound Total:   ${FileUtils.formatMemorySize(adapter.writtenBytes)}\n`
    result += `Inbound Total:    ${FileUtils.formatMemorySize(adapter.readBytes)}\n`
    result += `RW Backlog:       ${FileUtils.formatMemorySize(
      adapter.readableBytes,
    )} / ${FileUtils.formatMemorySize(adapter.writableBytes)}`
  }

  return result
}
