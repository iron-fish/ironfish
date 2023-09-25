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
import { Assert, AssetStatus, BufferUtils } from '@ironfish/sdk'
import { CliUx } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { renderAssetNameFromHex } from '../../utils'
import { TableCols } from '../../utils/table'

const MAX_ASSET_METADATA_COLUMN_WIDTH = ASSET_METADATA_LENGTH + 1
const MIN_ASSET_METADATA_COLUMN_WIDTH = ASSET_METADATA_LENGTH / 2 + 1

const MAX_ASSET_NAME_COLUMN_WIDTH = ASSET_NAME_LENGTH + 1
const MIN_ASSET_NAME_COLUMN_WIDTH = ASSET_NAME_LENGTH / 2 + 1

const { ...tableFlags } = CliUx.ux.table.flags()

export class AssetsCommand extends IronfishCommand {
  static description = `Display the wallet's assets`

  static flags = {
    ...RemoteFlags,
    ...tableFlags,
  }

  static args = [
    {
      name: 'account',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: false,
      description: 'Name of the account',
    },
  ]

  async start(): Promise<void> {
    const { flags, args } = await this.parse(AssetsCommand)
    const account = args.account as string | undefined

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
      let status: string
      if (Asset.nativeId().toString('hex') === asset.id) {
        status = AssetStatus.CONFIRMED
      } else {
        const transaction = await client.wallet.getAccountTransaction({
          hash: asset.createdTransactionHash,
        })
        Assert.isNotNull(transaction.content.transaction)
        status = transaction.content.transaction.status
      }

      CliUx.ux.table(
        [asset],
        {
          name: TableCols.fixedWidth({
            header: 'Name',
            width: assetNameWidth,
            get: (row) =>
              renderAssetNameFromHex(row.name, {
                verification: row.verification,
                outputType: flags.output,
                verbose: !!flags.verbose,
                logWarn: this.warn.bind(this),
              }),
          }),
          id: {
            header: 'ID',
            minWidth: ASSET_ID_LENGTH + 1,
          },
          metadata: TableCols.fixedWidth({
            header: 'Metadata',
            width: assetMetadataWidth,
            get: (row) => BufferUtils.toHuman(Buffer.from(row.metadata, 'hex')),
          }),
          status: {
            header: 'Status',
            minWidth: 12,
            get: () => status,
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
