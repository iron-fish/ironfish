/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Args } from '@oclif/core'
import { IronfishCommand } from '../../../../command'
import * as ui from '../../../../ui'
import { LedgerDkg } from '../../../../utils/ledger'

export class MultisigLedgerRestore extends IronfishCommand {
  static description = `restore encrypted multisig keys to a Ledger device`

  static args = {
    backup: Args.string({
      required: false,
      description: 'Encrypted multisig key backup from your Ledger device',
    }),
  }

  async start(): Promise<void> {
    const { args } = await this.parse(MultisigLedgerRestore)

    let encryptedKeys = args.backup
    if (!encryptedKeys) {
      encryptedKeys = await ui.longPrompt(
        'Enter the encrypted multisig key backup to restore to your Ledger device',
      )
    }

    const ledger = new LedgerDkg(this.logger)
    try {
      await ledger.connect()
    } catch (e) {
      if (e instanceof Error) {
        this.error(e.message)
      } else {
        throw e
      }
    }

    await ledger.dkgRestoreKeys(encryptedKeys)

    this.log()
    this.log('Encrypted multisig key backup restored to Ledger.')
  }
}
