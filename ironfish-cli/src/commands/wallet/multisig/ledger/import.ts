/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { AccountFormat, encodeAccountImport } from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../../../command'
import { RemoteFlags } from '../../../../flags'
import { LedgerError, LedgerMultiSigner } from '../../../../ledger'
import * as ui from '../../../../ui'
import { importAccount } from '../../../../utils'

export class MultisigLedgerImport extends IronfishCommand {
  static description = `import a multisig account from a Ledger device`
  static hidden = true

  static flags = {
    ...RemoteFlags,
    name: Flags.string({
      description: 'Name to use for the account',
      char: 'n',
    }),
    createdAt: Flags.integer({
      description: 'Block sequence to begin scanning from for the imported account',
    }),
  }

  async start(): Promise<void> {
    this.warn(
      `The 'ironfish wallet:multisig:ledger:import' command is deprecated. Use 'ironfish wallet:import --ledger --multisig'`,
    )

    const { flags } = await this.parse(MultisigLedgerImport)

    const client = await this.connectRpc()
    await ui.checkWalletUnlocked(client)

    const name = flags.name ?? (await ui.inputPrompt('Enter a name for the account', true))

    let account
    try {
      const ledger = new LedgerMultiSigner()
      const accountImport = await ui.ledger({
        ledger,
        message: 'Import Wallet',
        approval: true,
        action: () => ledger.importAccount(),
      })

      account = encodeAccountImport(accountImport, AccountFormat.Base64Json)
    } catch (e) {
      if (e instanceof LedgerError) {
        this.logger.error(e.message + '\n')
        this.exit(1)
      } else {
        this.error('Unknown error while importing account from ledger device.')
      }
    }

    const { name: accountName } = await importAccount(
      client,
      account,
      this.logger,
      name,
      flags.createdAt,
    )

    this.log()
    this.log(`Account ${accountName} imported`)
  }
}
