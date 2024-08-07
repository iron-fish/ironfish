/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { FileUtils, PromiseUtils } from '@ironfish/sdk'
import { GetMempoolStatusResponse } from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import blessed from 'blessed'
import { IronfishCommand } from '../../command'
import { JsonFlags, RemoteFlags } from '../../flags'
import * as ui from '../../ui'

export default class Status extends IronfishCommand {
  static description = "show the mempool's status"
  static enableJsonFlag = true

  static flags = {
    ...RemoteFlags,
    ...JsonFlags,
    follow: Flags.boolean({
      char: 'f',
      default: false,
      description: 'Follow the status of the mempool live',
    }),
  }

  async start(): Promise<unknown> {
    const { flags } = await this.parse(Status)

    if (!flags.follow) {
      const client = await this.connectRpc()
      const response = await client.mempool.getMempoolStatus()
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

      const response = this.sdk.client.mempool.getMempoolStatusStream()
      for await (const value of response.contentStream()) {
        statusText.setContent(renderStatus(value))
        screen.render()
      }
    }
  }
}

function renderStatus(content: GetMempoolStatusResponse): string {
  const storage = FileUtils.formatMemorySize(content.sizeBytes)
  const maxStorage = FileUtils.formatMemorySize(content.maxSizeBytes)
  const saturationPercentage = ((content.sizeBytes / content.maxSizeBytes) * 100).toFixed(2)

  return ui.card({
    'Tx Count': content.size,
    Memory: `${storage} / ${maxStorage} (${saturationPercentage}%)`,
    'Eviction Cache': `${content.recentlyEvictedCache.size} / ${content.recentlyEvictedCache.maxSize}`,
    Evictions: content.evictions,
    'Head Sequence': content.headSequence,
  })
}
