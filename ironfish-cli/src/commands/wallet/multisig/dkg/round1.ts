/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../../../command'
import { RemoteFlags } from '../../../../flags'
import { LedgerMultiSigner } from '../../../../ledger'
import * as ui from '../../../../ui'

export class DkgRound1Command extends IronfishCommand {
  static description = 'Perform round1 of the DKG protocol for multisig account creation'

  static flags = {
    ...RemoteFlags,
    participantName: Flags.string({
      char: 'n',
      description: 'The name of the secret to use for encryption during DKG',
      aliases: ['name'],
    }),
    identity: Flags.string({
      char: 'i',
      description:
        'The identity of the participants will generate the group keys (may be specified multiple times to add multiple participants)',
      multiple: true,
    }),
    minSigners: Flags.integer({
      char: 'm',
      description: 'Minimum number of signers to meet signing threshold',
    }),
    ledger: Flags.boolean({
      default: false,
      description: 'Perform operation with a ledger device',
      exclusive: ['participantName'],
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(DkgRound1Command)

    const client = await this.connectRpc()
    await ui.checkWalletUnlocked(client)

    let identities = flags.identity
    if (!identities || identities.length < 2) {
      const input = await ui.longPrompt(
        'Enter the identities of all participants, separated by commas',
        {
          required: true,
        },
      )
      identities = input.split(',')

      if (identities.length < 2) {
        this.error('Minimum number of identities must be at least 2')
      }
    }
    identities = identities.map((i) => i.trim())

    let minSigners = flags.minSigners
    if (!minSigners) {
      const input = await ui.inputPrompt('Enter the number of minimum signers', true)
      minSigners = parseInt(input)
      if (isNaN(minSigners) || minSigners < 2) {
        this.error('Minimum number of signers must be at least 2')
      }
    }

    if (flags.ledger) {
      await this.performRound1WithLedger(identities, minSigners)
      return
    }

    let participantName = flags.participantName
    if (!participantName) {
      participantName = await ui.multisigSecretPrompt(client)
    }

    const response = await client.wallet.multisig.dkg.round1({
      participantName,
      participants: identities.map((identity) => ({ identity })),
      minSigners: minSigners,
    })

    this.log('\nRound 1 Encrypted Secret Package:\n')
    this.log(response.content.round1SecretPackage)
    this.log()

    this.log('\nRound 1 Public Package:\n')
    this.log(response.content.round1PublicPackage)
    this.log()

    this.log('Next step:')
    this.log('Send the round 1 public package to each participant')
  }

  async performRound1WithLedger(identities: string[], minSigners: number): Promise<void> {
    const ledger = new LedgerMultiSigner()

    const identity = (
      await ui.ledger({
        ledger,
        message: 'Getting Ledger Identity',
        action: () => ledger.dkgGetIdentity(0),
      })
    ).toString('hex')

    if (!identities.includes(identity)) {
      identities.push(identity)
    }

    const { publicPackage, secretPackage } = await ui.ledger({
      ledger,
      message: 'Round1 on Ledger',
      approval: true,
      action: () => ledger.dkgRound1(0, identities, minSigners),
    })

    this.log('\nRound 1 Encrypted Secret Package:\n')
    this.log(secretPackage.toString('hex'))
    this.log()

    this.log('\nRound 1 Public Package:\n')
    this.log(publicPackage.toString('hex'))
    this.log()

    this.log('Next step:')
    this.log('Send the round 1 public package to each participant')
  }
}
