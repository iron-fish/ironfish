/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ConsoleReporterInstance, IJSON } from '@ironfish/sdk'
import { logType } from 'consola'
import { IronfishCommand } from '../command'
import { RemoteFlags } from '../flags'

export default class LogsCommand extends IronfishCommand {
  static description = 'show node logs'

  static flags = {
    ...RemoteFlags,
  }

  async start(): Promise<void> {
    await this.parse(LogsCommand)
    await this.sdk.client.connect()

    const response = this.sdk.client.node.getLogStream()

    for await (const value of response.contentStream()) {
      let parsedArgs
      try {
        parsedArgs = IJSON.parse(value.args) as unknown[]
      } catch (e) {
        this.logger.error(`Failed to deserialize args: ${value.args}`)
        throw e
      }

      ConsoleReporterInstance.log({
        level: Number(value.level),
        type: value.type as logType,
        tag: value.tag,
        args: parsedArgs,
        date: new Date(value.date),
      })
    }

    this.exit(0)
  }
}
