/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createRootLogger } from '@ironfish/sdk'
import { TestNode } from '../../automated-test-network/testnode'
import { IronfishCommand } from '../../command'

/**
 * TODOs
 * - send transactions around
 * - support mempool sizing in config
 * - don't print out all the logs, just the important stuff
 *   - add command to tail logs for a specific node
 */

export default class Start extends IronfishCommand {
  static description = 'Start the test network'

  async start(): Promise<void> {
    const logger = createRootLogger()
    await this.sdk.connectRpc()

    // TODO: read config from `config.json` file before using config file
    // TODO: abstract this into a node manager that owns the nodes
    const nodes = await Promise.all(
      config.map((cfg) => {
        return TestNode.initialize(cfg, logger)
      }),
    )

    logger.log('atf is running, block')

    // // wait for all nodes to be stopped
    try {
      await Promise.all(
        nodes.map(async (node) => {
          await node.waitForShutdown()
        }),
      )
    } catch (e) {
      logger.log(`error: ${String(e)}`)
    }

    logger.log('stopping atf')
  }
}

export const config = [
  {
    name: 'node1',
    graffiti: '1',
    port: 8001,
    data_dir: '~/.ironfish_atf/node1',
    netword_id: 2,
    is_miner: true,
    bootstrap_url: "''",
    tcp_host: 'localhost',
    tcp_port: 9001,
  },
  {
    name: 'node2',
    graffiti: '2',
    port: 8002,
    data_dir: '~/.ironfish_atf/node2',
    netword_id: 2,
    bootstrap_url: 'localhost:8001',
    tcp_host: 'localhost',
    tcp_port: 9002,
  },
  {
    name: 'node3',
    graffiti: '3',
    port: 8003,
    data_dir: '~/.ironfish_atf/node3',
    netword_id: 2,
    bootstrap_url: 'localhost:8001',
    tcp_host: 'localhost',
    tcp_port: 9003,
  },
]
