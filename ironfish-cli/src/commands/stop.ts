/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { FullNode } from '@ironfish/sdk'
import { ux } from '@oclif/core'
import { IronfishCommand } from '../command'
import { RemoteFlags } from '../flags'

export default class StopCommand extends IronfishCommand {
  static description = 'stop the node'

  static flags = {
    ...RemoteFlags,
  }

  node: FullNode | null = null

  async start(): Promise<void> {
    await this.parse(StopCommand)

    await this.sdk.client.connect()

    ux.action.start('Asking node to shut down...')

    await this.sdk.client.node.stopNode()

    ux.action.stop('done.')
  }
}
