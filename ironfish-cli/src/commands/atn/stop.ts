/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createRootLogger } from '@ironfish/sdk'
import { stopSimulationNode } from '../../automated-test-network'
import { IronfishCommand } from '../../command'
import { nodeConfig } from './start'

export default class Stop extends IronfishCommand {
  static description = 'Stop all nodes in the test network'

  async start(): Promise<void> {
    const nodes = nodeConfig
    const logger = createRootLogger()

    // TODO: abstract this into the orchestrator that owns the nodes
    // external requests should not be able to access the nodes directly
    // everything should go through the orchestrator

    await Promise.all(
      nodes.map(async (node) => {
        const { success, msg } = await stopSimulationNode(node)
        if (!success) {
          logger.error(`couldn't stop node ${node.name}: ${msg}`)
        } else {
          logger.info(`stopped node ${node.name}!`)
        }
      }),
    )
  }
}
