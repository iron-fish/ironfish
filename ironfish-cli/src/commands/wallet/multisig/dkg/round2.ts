/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../../../command'
import { RemoteFlags } from '../../../../flags'
import { LedgerMultiSigner } from '../../../../ledger'
import * as ui from '../../../../ui'

export class DkgRound2Command extends IronfishCommand {
  static description = 'Perform round2 of the DKG protocol for multisig account creation'

  static flags = {
    ...RemoteFlags,
    participantName: Flags.string({
      char: 'n',
      description: 'The name of the secret to use for encryption during DKG',
      aliases: ['name'],
    }),
    round1SecretPackage: Flags.string({
      char: 'e',
      description: 'The encrypted secret package created during DKG round 1',
    }),
    round1PublicPackages: Flags.string({
      char: 'p',
      description:
        'The public packages that each participant generated during DKG round 1 (may be specified multiple times for multiple participants). Must include your own round 1 public package',
      multiple: true,
    }),
    ledger: Flags.boolean({
      default: false,
      description: 'Perform operation with a ledger device',
      exclusive: ['participantName'],
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(DkgRound2Command)

    const client = await this.connectRpc()
    await ui.checkWalletUnlocked(client)

    let round1SecretPackage = flags.round1SecretPackage
    if (!round1SecretPackage) {
      round1SecretPackage = await ui.inputPrompt('Enter your round 1 secret package', true)
    }

    let round1PublicPackages = flags.round1PublicPackages
    if (!round1PublicPackages || round1PublicPackages.length < 2) {
      const input = await ui.longPrompt(
        'Enter round 1 public packages, separated by commas, one for each participant',
        { required: true },
      )
      round1PublicPackages = input.split(',')

      if (round1PublicPackages.length < 2) {
        this.error(
          'Must include a round 1 public package for each participant; at least 2 participants required',
        )
      }
    }
    round1PublicPackages = round1PublicPackages.map((i) => i.trim())

    if (flags.ledger) {
      await this.performRound2WithLedger(round1PublicPackages, round1SecretPackage)
      return
    }

    let participantName = flags.participantName
    if (!participantName) {
      participantName = await ui.multisigSecretPrompt(client)
    }

    const response = await client.wallet.multisig.dkg.round2({
      participantName,
      round1SecretPackage,
      round1PublicPackages,
    })

    this.log('\nRound 2 Encrypted Secret Package:\n')
    this.log(response.content.round2SecretPackage)
    this.log()

    this.log('\nRound 2 Public Package:\n')
    this.log(response.content.round2PublicPackage)
    this.log()

    this.log()
    this.log('Next step:')
    this.log('Send the round 2 public package to each participant')
  }

  async performRound2WithLedger(
    round1PublicPackages: string[],
    round1SecretPackage: string,
  ): Promise<void> {
    const ledger = new LedgerMultiSigner()

    const { publicPackage, secretPackage } = await ui.ledger({
      ledger,
      message: 'Round2 on Ledger',
      approval: true,
      action: () => ledger.dkgRound2(0, round1PublicPackages, round1SecretPackage),
    })

    this.log('\nRound 2 Encrypted Secret Package:\n')
    this.log(secretPackage.toString('hex'))
    this.log()

    this.log('\nRound 2 Public Package:\n')
    this.log(publicPackage.toString('hex'))
    this.log()

    this.log()
    this.log('Next step:')
    this.log('Send the round 2 public package to each participant')
  }
}
