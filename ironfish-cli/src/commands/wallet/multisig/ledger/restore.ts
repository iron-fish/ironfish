/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../../../command'
import * as ui from '../../../../ui'
import { initializeLedger } from '../../../../utils/ledger'

export class MultisigLedgerRestore extends IronfishCommand {
  static description = `restore encrypted multisig keys to a Ledger device`

  static flags = {
    backup: Flags.string({
      description: 'Encrypted multisig key backup from your Ledger device',
      char: 'b',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(MultisigLedgerRestore)

    let encryptedKeys = flags.backup
    if (!encryptedKeys) {
      encryptedKeys = await ui.longPrompt(
        'Enter the encrypted multisig key backup to restore to your Ledger device',
      )
    }

    const ledger = await initializeLedger(true, this.logger)

    await ledger.dkgRestoreKeys(encryptedKeys)

    this.log()
    this.log('Encrypted multisig key backup restored to Ledger.')
  }
}
