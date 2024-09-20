/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { FileUtils, renderNetworkName } from '@ironfish/sdk'
import { IronfishCommand } from '../../command'
import { JsonFlags, RemoteFlags } from '../../flags'
import * as ui from '../../ui'

export default class ChainStatus extends IronfishCommand {
  static description = 'show blockchain information'
  static enableJsonFlag = true

  static flags = {
    ...JsonFlags,
    ...RemoteFlags,
  }

  async start(): Promise<unknown> {
    const client = await this.connectRpc()

    const [status, difficulty, power] = await Promise.all([
      client.node.getStatus(),
      client.chain.getDifficulty(),
      client.chain.getNetworkHashPower(),
    ])

    this.log(
      ui.card({
        Network: renderNetworkName(status.content.node.networkId),
        Blocks: status.content.blockchain.head.sequence,
        Hash: status.content.blockchain.head.hash,
        Time: new Date(status.content.blockchain.headTimestamp).toLocaleString(),
        Synced: status.content.blockchain.synced,
        Difficulty: difficulty.content.difficulty,
        Size: FileUtils.formatFileSize(status.content.blockchain.dbSizeBytes),
        Work: status.content.blockchain.dbSizeBytes,
        Power: FileUtils.formatHashRate(power.content.hashesPerSecond),
      }),
    )

    return {
      blockchain: status.content.blockchain,
      difficulty: difficulty.content,
      power: power.content,
      node: {
        network: renderNetworkName(status.content.node.networkId),
        networkId: status.content.node.networkId,
      },
    }
  }
}
