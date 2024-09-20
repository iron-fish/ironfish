/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { IronfishCommand } from '../../../../command'
import { Ledger } from '../../../../utils/ledger'

export class MultisigLedgerBackup extends IronfishCommand {
  static description = `show encrypted multisig keys from a Ledger device`

  async start(): Promise<void> {
    const ledger = new Ledger(this.logger)
    try {
      await ledger.connect(true)
    } catch (e) {
      if (e instanceof Error) {
        this.error(e.message)
      } else {
        throw e
      }
    }

    const encryptedKeys = await ledger.dkgBackupKeys()

    this.log()
    this.log('Encrypted Ledger Multisig Backup:')
    this.log(encryptedKeys.toString('hex'))
    this.log()
    this.log('Please save the encrypted keys show above.')
    this.log(
      'Use `ironfish wallet:multisig:ledger:restore` if you need to restore the keys to your Ledger.',
    )
  }
}
