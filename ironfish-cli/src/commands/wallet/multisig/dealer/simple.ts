/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '@ironfish/sdk'
import { CliUx } from '@oclif/core'
import { IronfishCommand } from '../../../../command'
import { RemoteFlags } from '../../../../flags'

export class MultisigCreateSimple extends IronfishCommand {
  static description = `Create a multisig participant identity`

  static flags = {
    ...RemoteFlags,
  }

  async start(): Promise<void> {
    await this.parse(MultisigCreateSimple)

    const client = await this.sdk.connectRpc()

    this.log('This command will generate a new set of multisig accounts')

    let participants: number | null = null
    let threshold: number | null = null

    const setName = await CliUx.ux.prompt('Enter a name for the new account set', {
      required: true,
    })

    while (participants === null) {
      const input = parseInt(
        await CliUx.ux.prompt('Enter the number of participants', {
          required: true,
        }),
      )

      if (isNaN(input)) {
        this.error('Input was not a number')
        continue
      }

      if (input < 2) {
        this.error('There must be 2 or more participants')
        continue
      }

      participants = input
    }

    while (threshold === null) {
      const input = parseInt(
        await CliUx.ux.prompt('Enter the number of signatures requires', {
          required: true,
        }),
      )

      if (isNaN(input)) {
        this.error('Input was not a number')
        continue
      }

      if (input < 2) {
        this.error('There must be 2 or more signers')
        continue
      }

      if (input > participants) {
        this.error(`You cannot require more than ${participants} participants.`)
        continue
      }

      threshold = input
    }

    const identityToName = new Map<string, string>()

    for (let i = 0; i < participants; ++i) {
      const name = `${setName}-${i}`
      this.log(`Creating ${name}`)
      const response = await client.wallet.multisig.createParticipant({ name })
      this.log(`Created identity for ${name}: ${response.content.identity}`)
      identityToName.set(response.content.identity, name)
    }

    this.log('Creating trusted dealer key package.')

    Assert.isNotNull(threshold)

    const packageResponse = await client.wallet.multisig.createTrustedDealerKeyPackage({
      minSigners: threshold,
      participants: Array.from(identityToName.values()).map((identity) => ({ identity })),
    })

    this.log('Importing all accounts into node')

    CliUx.ux.action.start('Importing multisig accounts')

    for (const { identity, account } of packageResponse.content.participantAccounts) {
      const name = identityToName.get(identity)
      CliUx.ux.action.status = `Importing ${name}`
      await client.wallet.importAccount({ account: account })
      this.log(`Imported ${name}`)
    }

    CliUx.ux.action.stop()
  }
}
