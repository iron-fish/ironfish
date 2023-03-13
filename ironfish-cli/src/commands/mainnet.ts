/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ErrorUtils, HOST_FILE_NAME } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import fsAsync from 'fs/promises'
import { IronfishCommand } from '../command'
import {
  ConfigFlag,
  ConfigFlagKey,
  DataDirFlag,
  DataDirFlagKey,
  VerboseFlag,
  VerboseFlagKey,
} from '../flags'

export default class Mainnet extends IronfishCommand {
  static description = 'Migrate Iron Fish testnet data to mainnet'

  static flags = {
    [VerboseFlagKey]: VerboseFlag,
    [ConfigFlagKey]: ConfigFlag,
    [DataDirFlagKey]: DataDirFlag,
    confirm: Flags.boolean({
      default: false,
      description: 'Confirm without asking',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(Mainnet)

    const currentNetworkId = this.sdk.internal.get('networkId')
    if (currentNetworkId === 1) {
      this.log(`Data directory is already set up for mainnet.`)
      this.exit(0)
    }

    const chainDatabasePath = this.sdk.config.chainDatabasePath
    const hostFilePath: string = this.sdk.config.files.join(
      this.sdk.config.dataDir,
      HOST_FILE_NAME,
    )

    const message =
      '\nYou are about to migrate your Iron Fish data to mainnet.' +
      '\nYour wallet, accounts, and node configuration will be saved.' +
      `\n\nThis data directory will be migrated: ${this.sdk.config.dataDir}` +
      `\n\nAre you sure? (Y)es / (N)o`

    const confirmed = flags.confirm || (await CliUx.ux.confirm(message))

    if (!confirmed) {
      this.log('Migration aborted.')
      this.exit(0)
    }

    CliUx.ux.action.start('Migrating data...')

    try {
      await Promise.all([
        fsAsync.rm(chainDatabasePath, { recursive: true, force: true }),
        fsAsync.rm(hostFilePath, { recursive: true, force: true }),
      ])
    } catch (error: unknown) {
      CliUx.ux.action.stop('error')
      this.log(
        '\nAn error occurred while migrating to mainnet. Please stop all running Iron Fish nodes and try again.',
      )
      this.logger.debug(ErrorUtils.renderError(error, true))
      this.exit(1)
    }

    // Reset the telemetry config to allow people to re-opt in
    if (this.sdk.config.isSet('enableTelemetry') && this.sdk.config.get('enableTelemetry')) {
      this.sdk.config.clear('enableTelemetry')
      await this.sdk.config.save()
    }

    this.sdk.internal.set('networkId', 1)
    this.sdk.internal.set('isFirstRun', true)
    this.sdk.internal.clear('telemetryNodeId')
    await this.sdk.internal.save()

    CliUx.ux.action.stop('Data migrated successfully.')
  }
}
