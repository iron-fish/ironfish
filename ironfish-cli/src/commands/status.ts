/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { flags } from '@oclif/command'
import { PromiseUtils, GetStatusResponse, FileUtils } from 'ironfish'
import { Assert } from 'ironfish'
import { IronfishCommand } from '../command'
import { RemoteFlags } from '../flags'
import blessed from 'blessed'

export default class Status extends IronfishCommand {
  static description = 'Show the status of the node'

  static flags = {
    ...RemoteFlags,
    follow: flags.boolean({
      char: 'f',
      default: false,
      description: 'follow the status of the node live',
    }),
  }

  async start(): Promise<void> {
    const { flags } = this.parse(Status)

    if (!flags.follow) {
      const connected = await this.sdk.client.tryConnect()

      if (!connected) {
        this.log('Node: STOPPED')
      } else {
        const response = await this.sdk.client.status()
        this.log(renderStatus(response.content))
      }

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

      const response = this.sdk.client.statusStream()

      for await (const value of response.contentStream()) {
        statusText.clearBaseLine(0)
        statusText.setContent(renderStatus(value))
        screen.render()
      }
    }
  }
}

function renderStatus(content: GetStatusResponse): string {
  const nodeStatus = content.node.status.toUpperCase()
  let blockSyncerStatus = content.blockSyncer.status.toString().toUpperCase()

  Assert.isNotUndefined(content.blockSyncer.syncing)

  const avgTimeToAddBlock = content.blockSyncer.syncing.blockSpeed
  const speed = content.blockSyncer.syncing.speed
  if (content.blockSyncer.status !== 'IDLE') {
    blockSyncerStatus += ` @ ${speed} blocks per seconds`
  }

  if (avgTimeToAddBlock) {
    blockSyncerStatus += ` | avg time to add block ${avgTimeToAddBlock} ms`
  }

  const peerNetworkStatus = `${
    content.peerNetwork.isReady ? 'CONNECTED' : 'WAITING'
  } In: ${FileUtils.formatFileSize(
    content.peerNetwork.inboundTraffic,
  )}/s, Out: ${FileUtils.formatFileSize(content.peerNetwork.outboundTraffic)}/s, peers ${
    content.peerNetwork.peers
  }`

  const blockchainStatus = `${content.blockchain.synced ? 'SYNCED' : 'NOT SYNCED'}, HEAD ${
    content.blockchain.head
  }`

  return `
Node:                 ${nodeStatus}
P2P Network:          ${peerNetworkStatus}
Blocks syncing:       ${blockSyncerStatus}
Blockchain:           ${blockchainStatus}`
}
