/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { AccountDecryptionFailedError, EncryptedWalletMigrationError } from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { inputPrompt } from '../../ui'

export class StartCommand extends IronfishCommand {
  static description = `run migrations`

  static flags = {
    dry: Flags.boolean({
      default: false,
      description: 'Dry run migrations first',
      hidden: true,
    }),
    quiet: Flags.boolean({
      char: 'q',
      default: false,
    }),
    passphrase: Flags.string({
      description: 'Passphrase to unlock the wallet database with',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(StartCommand)

    const node = await this.sdk.node()

    let walletPassphrase = flags.passphrase
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        await node.migrator.migrate({ quiet: flags.quiet, dryRun: flags.dry, walletPassphrase })
        break
      } catch (e) {
        if (
          e instanceof EncryptedWalletMigrationError ||
          e instanceof AccountDecryptionFailedError
        ) {
          this.logger.info(e.message)
          walletPassphrase = await inputPrompt(
            'Enter your passphrase to unlock the wallet',
            true,
            {
              password: true,
            },
          )
        } else {
          throw e
        }
      }
    }
  }
}
