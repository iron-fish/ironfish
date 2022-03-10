/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { GetWorkersStatusResponse, PromiseUtils } from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import blessed from 'blessed'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export default class Status extends IronfishCommand {
  static description = 'Show the status of the worker pool'

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
      const response = await client.getWorkersStatus()
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

      const response = this.sdk.client.getWorkersStatusStream()
      for await (const value of response.contentStream()) {
        statusText.setContent(renderStatus(value))
        screen.render()
      }
    }
  }
}

function renderStatus(content: GetWorkersStatusResponse): string {
  let workersStatus = `${content.started ? 'STARTED' : 'STOPPED'}`
  if (content.started) {
    workersStatus += ` - ${content.queued} -> ${content.executing} / ${content.capacity} - ${content.change} jobs Δ, ${content.speed} jobs/s`
  }

  let status = `\n${'JOB'.padEnd(20, ' ')} | QUEUE | EXECUTE | ERROR | DONE \n`
  for (const job of content.jobs) {
    status += `${job.name.padEnd(20, ' ')} | ${String(job.queue).padStart(5, ' ')} | ${String(
      job.execute,
    ).padStart(7, ' ')} | ${String(job.error).padStart(5, ' ')} | ${String(job.complete).padEnd(
      6,
      ' ',
    )}\n`
  }

  return `Workers: ${workersStatus}\n${status}`
}
