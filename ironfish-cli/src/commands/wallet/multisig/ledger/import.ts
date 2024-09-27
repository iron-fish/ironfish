/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ACCOUNT_SCHEMA_VERSION, AccountFormat, encodeAccountImport } from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../../../command'
import { RemoteFlags } from '../../../../flags'
import * as ui from '../../../../ui'
import { importAccount } from '../../../../utils'
import { LedgerDkg } from '../../../../utils/ledger'

export class MultisigLedgerImport extends IronfishCommand {
  static description = `import a multisig account from a Ledger device`

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
    const { flags } = await this.parse(MultisigLedgerImport)

    const client = await this.connectRpc()
    await ui.checkWalletUnlocked(client)

    const name = flags.name ?? (await ui.inputPrompt('Enter a name for the account', true))

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

    const identity = await ledger.dkgGetIdentity(0)
    const dkgKeys = await ledger.dkgRetrieveKeys()
    const publicKeyPackage = await ledger.dkgGetPublicPackage()

    const accountImport = {
      ...dkgKeys,
      multisigKeys: {
        publicKeyPackage: publicKeyPackage.toString('hex'),
        identity: identity.toString('hex'),
      },
      version: ACCOUNT_SCHEMA_VERSION,
      name,
      spendingKey: null,
      createdAt: null,
    }

    const { name: accountName } = await importAccount(
      client,
      encodeAccountImport(accountImport, AccountFormat.Base64Json),
      this.logger,
      name,
      flags.createdAt,
    )

    this.log()
    this.log(`Account ${accountName} imported with public address: ${dkgKeys.publicAddress}`)
  }
}
