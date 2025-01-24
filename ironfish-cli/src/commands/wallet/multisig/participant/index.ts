/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Flags } from '@oclif/core'
import inquirer from 'inquirer'
import { IronfishCommand } from '../../../../command'
import { RemoteFlags } from '../../../../flags'
import { LedgerMultiSigner } from '../../../../ledger'
import * as ui from '../../../../ui'

export class MultisigIdentity extends IronfishCommand {
  static description = `Retrieve a multisig participant identity`

  static flags = {
    ...RemoteFlags,
    name: Flags.string({
      char: 'n',
      description: 'Name of the participant identity',
    }),
    ledger: Flags.boolean({
      default: false,
      description: 'Retrieve participant identity from a ledger device',
      exclusive: ['name'],
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(MultisigIdentity)

    if (flags.ledger) {
      const ledger = new LedgerMultiSigner()

      const identity = (
        await ui.ledger({
          ledger,
          message: 'Getting Ledger Identity',
          action: () => ledger.dkgGetIdentity(0),
        })
      ).toString('hex')

      this.log('Identity:')
      this.log(identity)
    } else {
      const client = await this.connectRpc()
      await ui.checkWalletUnlocked(client)

      if (flags.name) {
        const response = await client.wallet.multisig.getIdentity({ name: flags.name })

        this.log('Identity:')
        this.log(response.content.identity)
      } else {
        const response = await client.wallet.multisig.getIdentities()

        const choices = []
        for (const { name, identity } of response.content.identities) {
          choices.push({
            name,
            value: identity,
          })
        }

        // sort identities by name
        choices.sort((a, b) => a.name.localeCompare(b.name))

        const selection = await inquirer.prompt<{
          identity: string
        }>([
          {
            name: 'identity',
            message: 'Select participant name to view identity',
            type: 'list',
            choices,
          },
        ])

        this.log('Identity:')
        this.log(selection.identity)
      }
    }
  }
}
