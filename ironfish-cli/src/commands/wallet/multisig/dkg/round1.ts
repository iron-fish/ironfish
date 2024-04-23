/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CliUx, Flags } from '@oclif/core'
import { IronfishCommand } from '../../../../command'
import { RemoteFlags } from '../../../../flags'
import { longPrompt } from '../../../../utils/longPrompt'
import { selectSecret } from '../../../../utils/multisig'

export class DkgRound1Command extends IronfishCommand {
  static description = 'Perform round1 of the DKG protocol for multisig account creation'
  static hidden = true

  static flags = {
    ...RemoteFlags,
    secretName: Flags.string({
      char: 's',
      description: 'The name of the secret to use for encryption during DKG',
    }),
    identity: Flags.string({
      char: 'i',
      description:
        'The identity of the participants will generate the group keys (may be specified multiple times to add multiple participants). Must include the identity for secretName',
      multiple: true,
    }),
    minSigners: Flags.integer({
      char: 'm',
      description: 'Minimum number of signers to meet signing threshold',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(DkgRound1Command)

    const client = await this.sdk.connectRpc()

    let secretName = flags.secretName
    if (!secretName) {
      secretName = await selectSecret(client)
    }

    let identities = flags.identity
    if (!identities || identities.length < 2) {
      const input = await longPrompt('Enter the identities separated by commas', {
        required: true,
      })
      identities = input.split(',')

      if (identities.length < 2) {
        this.error('Minimum number of identities must be at least 2')
      }
    }
    identities = identities.map((i) => i.trim())

    let minSigners = flags.minSigners
    if (!minSigners) {
      const input = await CliUx.ux.prompt('Enter the number of minimum signers', {
        required: true,
      })
      minSigners = parseInt(input)
      if (isNaN(minSigners) || minSigners < 2) {
        this.error('Minimum number of signers must be at least 2')
      }
    }

    const response = await client.wallet.multisig.dkg.round1({
      secretName: secretName,
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
}
