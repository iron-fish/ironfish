/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { IronfishCommand } from '../../../../command'
import { LedgerMultiSigner } from '../../../../ledger'
import * as ui from '../../../../ui'

export class MultisigLedgerBackup extends IronfishCommand {
  static description = `show encrypted multisig keys from a Ledger device`

  async start(): Promise<void> {
    const ledger = new LedgerMultiSigner()

    const encryptedKeys = await ui.ledger({
      ledger,
      message: 'Getting Ledger Keys',
      approval: true,
      action: () => ledger.dkgBackupKeys(),
    })

    this.log()
    this.log('Encrypted Ledger Multisig Backup:')
    this.log(encryptedKeys.toString('hex'))
    this.log()
    this.log('Please save the encrypted keys shown above.')
    this.log(
      'Use `ironfish wallet:multisig:ledger:restore` if you need to restore the keys to your Ledger.',
    )
  }
}
