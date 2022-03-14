/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ConnectionError, IronfishNode } from '@ironfish/sdk'
import { IronfishCommand } from '../command'
import { RemoteFlags } from '../flags'

export default class StopCommand extends IronfishCommand {
  static description = 'Stop the node from running'

  static flags = {
    ...RemoteFlags,
  }

  node: IronfishNode | null = null

  async start(): Promise<void> {
    await this.parse(StopCommand)

    await this.sdk.client.connect({ retryConnect: false }).catch((e) => {
      if (e instanceof ConnectionError) {
        this.exit(0)
      }
      throw e
    })

    await this.sdk.client.stopNode()
  }
}
