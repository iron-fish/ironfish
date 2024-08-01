/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BufferUtils } from '@ironfish/sdk'
import { Args } from '@oclif/core'
import { IronfishCommand } from '../../../command'
import { ColorFlag, ColorFlagKey, RemoteFlags } from '../../../flags'
import * as ui from '../../../ui'

export default class AssetInfo extends IronfishCommand {
  static description = 'show asset information'
  static enableJsonFlag = true

  static args = {
    id: Args.string({
      required: true,
      description: 'The identifier of the asset',
    }),
  }

  static flags = {
    ...RemoteFlags,
    [ColorFlagKey]: ColorFlag,
  }

  async start(): Promise<unknown> {
    const { args } = await this.parse(AssetInfo)
    const { id: assetId } = args

    const client = await this.connectRpc()
    const data = await client.chain.getAsset({ id: assetId })

    this.log(
      ui.card({
        Name: BufferUtils.toHuman(Buffer.from(data.content.name, 'hex')),
        Metadata: BufferUtils.toHuman(Buffer.from(data.content.metadata, 'hex')),
        Creator: data.content.creator,
        Owner: data.content.owner,
        Supply: data.content.supply ?? 'N/A',
        Identifier: data.content.id,
        'Transaction Created': data.content.createdTransactionHash,
      }),
    )

    return data.content
  }
}
