/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  Asset,
  ASSET_ID_LENGTH,
  ASSET_METADATA_LENGTH,
  ASSET_NAME_LENGTH,
  PUBLIC_ADDRESS_LENGTH,
} from '@ironfish/rust-nodejs'
import { BufferUtils } from '@ironfish/sdk'
import { Args, Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { table, TableFlags } from '../../ui'
import { renderAssetWithVerificationStatus } from '../../utils'
import { TableCols } from '../../utils/table'

const MAX_ASSET_METADATA_COLUMN_WIDTH = ASSET_METADATA_LENGTH + 1
const MIN_ASSET_METADATA_COLUMN_WIDTH = ASSET_METADATA_LENGTH / 2 + 1

const MAX_ASSET_NAME_COLUMN_WIDTH = ASSET_NAME_LENGTH + 1
const MIN_ASSET_NAME_COLUMN_WIDTH = ASSET_NAME_LENGTH / 2 + 1

export class AssetsCommand extends IronfishCommand {
  static description = `Display the wallet's assets`

  static flags = {
    ...RemoteFlags,
    ...TableFlags,
    account: Flags.string({
      char: 'a',
      description: 'Name of the account to get assets for',
    }),
  }

  static args = {
    account: Args.string({
      required: false,
      description: 'Name of the account. DEPRECATED: use --account flag',
    }),
  }

  async start(): Promise<void> {
    const { flags, args } = await this.parse(AssetsCommand)
    // TODO: remove account arg
    const account = flags.account ? flags.account : args.account

    const client = await this.sdk.connectRpc()
    const response = client.wallet.getAssets({
      account,
    })

    const assetMetadataWidth = flags.extended
      ? MAX_ASSET_METADATA_COLUMN_WIDTH
      : MIN_ASSET_METADATA_COLUMN_WIDTH
    const assetNameWidth = flags.extended
      ? MAX_ASSET_NAME_COLUMN_WIDTH
      : MIN_ASSET_NAME_COLUMN_WIDTH
    let showHeader = !flags['no-header']

    for await (const asset of response.contentStream()) {
      table(
        [asset],
        {
          name: TableCols.fixedWidth({
            header: 'Name',
            width: assetNameWidth,
            get: (row) =>
              renderAssetWithVerificationStatus(
                BufferUtils.toHuman(Buffer.from(row.name, 'hex')),
                {
                  verification: row.verification,
                  outputType: flags.output,
                },
              ),
          }),
          id: {
            header: 'ID',
            minWidth: ASSET_ID_LENGTH + 1,
            get: (row) => row.id,
          },
          metadata: TableCols.fixedWidth({
            header: 'Metadata',
            width: assetMetadataWidth,
            get: (row) => BufferUtils.toHuman(Buffer.from(row.metadata, 'hex')),
          }),
          createdTransactionHash: {
            header: 'Created Transaction Hash',
            get: (row) => row.createdTransactionHash,
          },
          supply: {
            header: 'Supply',
            minWidth: 16,
            get: (row) => row.supply ?? 'NULL',
          },
          creator: {
            header: 'Creator',
            minWidth: PUBLIC_ADDRESS_LENGTH + 1,
            get: (row) =>
              row.id === Asset.nativeId().toString('hex')
                ? BufferUtils.toHuman(Buffer.from(row.creator, 'hex'))
                : row.creator,
          },
          owner: {
            header: 'Owner',
            minWidth: PUBLIC_ADDRESS_LENGTH + 1,
            get: (row) =>
              row.id === Asset.nativeId().toString('hex')
                ? BufferUtils.toHuman(Buffer.from(row.owner, 'hex'))
                : row.owner,
          },
        },
        {
          printLine: this.log.bind(this),
          ...flags,
          'no-header': !showHeader,
        },
      )

      showHeader = false
    }
  }
}
