/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createRootLogger } from '@ironfish/sdk'
import { stopTestNode } from '../../automated-test-network/testnode'
import { IronfishCommand } from '../../command'
import { config } from './start'

export default class Stop extends IronfishCommand {
  static description = 'Stop all nodes in the test network'

  async start(): Promise<void> {
    const nodes = config
    const logger = createRootLogger()

    await Promise.all(
      nodes.map(async (node) => {
        const { success, msg } = await stopTestNode(node)
        if (!success) {
          logger.error(`couldn't stop node ${node.name}: ${msg}`)
        } else {
          logger.info(`stopped node ${node.name}!`)
        }
      }),
    )
  }
}
