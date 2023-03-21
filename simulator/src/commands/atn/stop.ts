/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createRootLogger } from '@ironfish/sdk'
import { stopSimulationNode } from '../../automated-test-network'
import { IronfishCommand } from '../../command'

export default class Stop extends IronfishCommand {
  static description = 'Stop all nodes in the test network'

  async start(): Promise<void> {
    const nodes = [
      {
        name: 'node1',
        tcp_host: 'localhost',
        tcp_port: 9001,
        data_dir: '~/.ironfish-atn/node1',
      },
      {
        name: 'node2',
        tcp_host: 'localhost',
        tcp_port: 9002,
        data_dir: '~/.ironfish-atn/node2',
      },
      {
        name: 'node3',
        tcp_host: 'localhost',
        tcp_port: 9003,
        data_dir: '~/.ironfish-atn/node3',
      },
    ]

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
