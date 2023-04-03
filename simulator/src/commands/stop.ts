/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createRootLogger } from '@ironfish/sdk'
import { Command } from '@oclif/core'
import { stopSimulationNode } from '../simulator'

export default class Stop extends Command {
  static description = 'Stop all nodes in the test network'

  // TODO: this command currently stops the nodes via hardcoding the following parameters.
  // The stop command should go through an API call to the simulator so it can dynamically
  // stop all running nodes.

  async run(): Promise<void> {
    const nodes = [
      {
        nodeName: 'node1',
        rpcTcpHost: 'localhost',
        rpcTcpPort: 9001,
        dataDir: '~/.ironfish-atn/node1',
      },
      {
        nodeName: 'node2',
        rpcTcpHost: 'localhost',
        rpcTcpPort: 9002,
        dataDir: '~/.ironfish-atn/node2',
      },
      {
        nodeName: 'node3',
        rpcTcpHost: 'localhost',
        rpcTcpPort: 9003,
        dataDir: '~/.ironfish-atn/node3',
      },
    ]

    const logger = createRootLogger()

    await Promise.all(
      nodes.map(async (node) => {
        const { success, msg } = await stopSimulationNode(node)
        if (!success) {
          logger.error(`couldn't stop node ${node.nodeName}: ${msg}`)
        } else {
          logger.info(`stopped node ${node.nodeName}!`)
        }
      }),
    )
  }
}
