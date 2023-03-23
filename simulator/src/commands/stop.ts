/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createRootLogger } from '@ironfish/sdk'
import { Command } from '@oclif/core'
import { stopSimulationNode } from '../simulator'

export default class Stop extends Command {
  static description = 'Stop all nodes in the test network'

  async run(): Promise<void> {
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

    // TODO: stop should go through an API call to the simulator

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
