/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Flags } from '@oclif/core'
import blessed from 'blessed'
import { FileUtils, GetStatusResponse, PromiseUtils } from 'ironfish'
import { Assert } from 'ironfish'
import { IronfishCommand } from '../command'
import { RemoteFlags } from '../flags'

export default class Status extends IronfishCommand {
  static description = 'Show the status of the node'

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
      const response = await client.status()
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
  const nodeStatus = `${content.node.status.toUpperCase()}`
  const heapTotal = FileUtils.formatMemorySize(content.memory.heapTotal)
  const heapUsed = FileUtils.formatMemorySize(content.memory.heapUsed)
  const rss = FileUtils.formatMemorySize(content.memory.rss)
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
  } - In: ${FileUtils.formatFileSize(
    content.peerNetwork.inboundTraffic,
  )}/s, Out: ${FileUtils.formatFileSize(content.peerNetwork.outboundTraffic)}/s, peers ${
    content.peerNetwork.peers
  }`

  const blockchainStatus = `${content.blockchain.synced ? 'SYNCED' : 'NOT SYNCED'} @ HEAD ${
    content.blockchain.head
  }`

  const miningDirectorStatus = `${content.miningDirector.status.toUpperCase()} - ${
    content.miningDirector.miners
  } miners, ${content.miningDirector.blocks} mined`

  const memPoolStatus = `${content.memPool.size} tx`

  let workersStatus = `${content.workers.started ? 'STARTED' : 'STOPPED'}`
  if (content.workers.started) {
    workersStatus += ` - ${content.workers.queued} -> ${content.workers.executing} / ${content.workers.capacity} - ${content.workers.change} jobs Δ, ${content.workers.speed} jobs/s`
  }

  return `
Version              ${content.node.version} @ ${content.node.git}
Node                 ${nodeStatus}
Heap Used            ${heapUsed} / ${heapTotal}
Memory               ${rss}
P2P Network          ${peerNetworkStatus}
Mining               ${miningDirectorStatus}
Mem Pool             ${memPoolStatus}
Syncer               ${blockSyncerStatus}
Blockchain           ${blockchainStatus}
Workers              ${workersStatus}`
}
