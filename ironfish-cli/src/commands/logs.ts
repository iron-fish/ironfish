/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { logType } from 'consola'
import { ConsoleReporterInstance, IronfishNode } from 'ironfish'
import { IronfishCommand } from '../command'
import { RemoteFlags } from '../flags'

export default class LogsCommand extends IronfishCommand {
  static description = 'Tail server logs'

  static flags = {
    ...RemoteFlags,
  }

  node: IronfishNode | null = null

  async start(): Promise<void> {
    this.parse(LogsCommand)

    await this.sdk.client.connect()

    const response = this.sdk.client.getLogStream()

    for await (const value of response.contentStream()) {
      ConsoleReporterInstance.log({
        level: Number(value.level),
        type: value.type as logType,
        tag: value.tag,
        args: value.args,
        date: new Date(value.date),
      })
    }

    this.exit(0)
  }
}
