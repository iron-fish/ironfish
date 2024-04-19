/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CliUx, Flags } from '@oclif/core'
import { IronfishCommand } from '../../../../command'
import { RemoteFlags } from '../../../../flags'
import { longPrompt } from '../../../../utils/longPrompt'
import { selectSecret } from '../../../../utils/multisig'

export class DkgRound2Command extends IronfishCommand {
  static description = 'Perform round2 of the DKG protocol for multisig account creation'
  static hidden = true

  static flags = {
    ...RemoteFlags,
    secretName: Flags.string({
      char: 's',
      description: 'The name of the secret to use for encryption during DKG',
    }),
    encryptedSecretPackage: Flags.string({
      char: 'e',
      description: 'The ecrypted secret package created during DKG round1',
    }),
    publicPackage: Flags.string({
      char: 'p',
      description:
        'The public package that a participant generated during DKG round1 (may be specified multiple times for multiple participants). Must include your own round1 public package',
      multiple: true,
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(DkgRound2Command)

    const client = await this.sdk.connectRpc()

    let secretName = flags.secretName
    if (!secretName) {
      secretName = await selectSecret(client)
    }

    let encryptedSecretPackage = flags.encryptedSecretPackage
    if (!encryptedSecretPackage) {
      encryptedSecretPackage = await CliUx.ux.prompt(
        `Enter the encrypted secret package for secret ${secretName}`,
        {
          required: true,
        },
      )
    }

    let publicPackages = flags.publicPackage
    if (!publicPackages || publicPackages.length < 2) {
      const input = await longPrompt(
        'Enter public packages separated by commas, one for each participant',
        {
          required: true,
        },
      )
      publicPackages = input.split(',')

      if (publicPackages.length < 2) {
        this.error(
          'Must include a public package for each participant; at least 2 participants required',
        )
      }
    }
    publicPackages = publicPackages.map((i) => i.trim())

    const response = await client.wallet.multisig.dkg.round2({
      secretName,
      encryptedSecretPackage,
      publicPackages,
    })

    this.log('\nEncrypted Secret Package:\n')
    this.log(response.content.encryptedSecretPackage)
    this.log()

    this.log('\nPublic Packages:\n')
    for (const { recipientIdentity, publicPackage } of response.content.publicPackages) {
      this.log('Recipient Identity')
      this.log(recipientIdentity)
      this.log('----------------')
      this.log(publicPackage)
      this.log()
    }

    this.log()
    this.log('Next step:')
    this.log('Send each public package to the participant with the matching identity')
  }
}
