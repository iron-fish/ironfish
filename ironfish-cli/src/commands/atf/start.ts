/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createRootLogger } from '@ironfish/sdk'
import {
  ActionConfig,
  ActionWorker,
  TestNode,
  TestNodeConfig,
} from '../../automated-test-network'
import { IronfishCommand } from '../../command'

/**
 * TODOs
 * - send transactions around
 * - support mempool sizing in config
 * - don't print out all the logs, just the important stuff
 *   - add command to tail logs for a specific node
 */

type OrchestratorConfig = {
  enabled: {
    nodes: boolean
    actions: boolean
  }
}

export const config: OrchestratorConfig = {
  enabled: { nodes: true, actions: true },
}

export default class Start extends IronfishCommand {
  static description = 'Start the test network'

  async start(): Promise<void> {
    const logger = createRootLogger()
    await this.sdk.connectRpc()

    const nodes: TestNode[] = []

    if (config.enabled.nodes) {
      logger.log('initializing nodes...')

      // TODO: read config from `config.json` file before using config file
      // TODO: abstract this into an orchestrator that owns the nodes
      void (
        await Promise.all(
          nodeConfig.map((cfg) => {
            return TestNode.initialize(cfg, logger)
          }),
        )
      ).forEach((node) => {
        nodes.push(node)
      })

      logger.log('nodes initialized')
    } else {
      logger.log('skipping nodes')
    }

    const actionWorkers: ActionWorker[] = []

    if (config.enabled.actions) {
      // execute actions
      logger.log('initializing action workers...')
      actionConfig.map((config) => {
        logger.log('creating action', config)

        const worker = new ActionWorker({ actionConfig: config, nodeConfig, logger })
        actionWorkers.push(worker)
      })

      logger.log('action workers initialized')
    } else {
      logger.log('skipping actions')
    }

    //TODO: this should block at orchestrator level but there's no way to do so
    // without the orchestrator having an HTTP interface.
    // Currently wait for the nodes to shutdown (via RPC call), then clean up actions
    // Ideally should wait on orchestrator shutdown request then action cleanup then node cleanup

    logger.log('starting atf, waiting for shutdown...')
    // block: wait for all nodes to be stopped
    try {
      await Promise.all(
        nodes.map(async (node) => {
          await node.waitForShutdown()
        }),
      )
    } catch (e) {
      logger.log(`node shutdown error: ${String(e)}`)
    }
    logger.log('nodes stopped')
    logger.log('try to stop action workers')

    // block: wait for all action workers to be stopped
    try {
      await Promise.all(
        actionWorkers.map(async (worker) => {
          await worker.stop()
        }),
      )
    } catch (e) {
      logger.log(`action worker shutdown error: ${String(e)}`)
    }

    logger.log('action workers stopped')

    logger.log('cleaning up')

    logger.log('stopping atf')
  }
}

export const nodeConfig: TestNodeConfig[] = [
  {
    name: 'node1',
    graffiti: '1',
    port: 7001,
    data_dir: '~/.ironfish-atf/node1',
    netword_id: 2,
    is_miner: true,
    bootstrap_url: "''",
    tcp_host: 'localhost',
    tcp_port: 9001,
    http_host: 'localhost',
    http_port: 8001,
  },
  {
    name: 'node2',
    graffiti: '2',
    port: 7002,
    data_dir: '~/.ironfish-atf/node2',
    netword_id: 2,
    bootstrap_url: 'localhost:7001',
    tcp_host: 'localhost',
    tcp_port: 9002,
    http_host: 'localhost',
    http_port: 8002,
  },
  {
    name: 'node3',
    graffiti: '3',
    port: 7003,
    data_dir: '~/.ironfish-atf/node3',
    netword_id: 2,
    bootstrap_url: 'localhost:7001',
    tcp_host: 'localhost',
    tcp_port: 9003,
    http_host: 'localhost',
    http_port: 8003,
  },
]

export const actionConfig: ActionConfig[] = [
  {
    kind: 'send',
    name: 'send 1 txn/ 10s with random spend [0:200000000] ORE from node1 to node2 ',
    from: 'node1',
    to: 'node2',
    rate: 1,
    spendLimit: 200000000,
    spendType: 'random',
  },
  // {
  //   kind: 'mint',
  //   name: 'mint 1000 ORE',
  //   amount: 1000,
  //   cost: 1000,
  // },
]
