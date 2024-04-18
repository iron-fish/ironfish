/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CliUx, Flags } from '@oclif/core'
import { IronfishCommand } from '../../../../command'
import { RemoteFlags } from '../../../../flags'
import { longPrompt } from '../../../../utils/longPrompt'
import { MultisigDkgJson } from '../../../../utils/multisig'

export class DkgRound2Command extends IronfishCommand {
  static description = 'Perform round2 of the DKG protocol for multisig account creation'
  static hidden = true

  static flags = {
    ...RemoteFlags,
    secretName: Flags.string({
      char: 's',
      description: 'The name of the secret to use for encryption during DKG',
      required: true,
    }),
    round1SecretPackage: Flags.string({
      char: 'e',
      description: 'The ecrypted secret package created during DKG round1',
    }),
    round1PublicPackage: Flags.string({
      char: 'p',
      description:
        'The public package that a participant generated during DKG round1 (may be specified multiple times for multiple participants). Must include your own round1 public package',
      multiple: true,
    }),
    path: Flags.string({
      description: 'Path to a JSON file containing DKG data',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(DkgRound2Command)

    const loaded = await MultisigDkgJson.load(this.sdk.fileSystem, flags.path)
    const options = MultisigDkgJson.resolveFlags(flags, loaded)

    let round1SecretPackage = options.round1SecretPackage
    if (!round1SecretPackage) {
      round1SecretPackage = await CliUx.ux.prompt(
        `Enter the encrypted secret package for secret ${flags.secretName}`,
        {
          required: true,
        },
      )
    }

    let round1PublicPackages = options.round1PublicPackage
    if (!round1PublicPackages || round1PublicPackages.length < 2) {
      const input = await longPrompt(
        'Enter public packages separated by commas, one for each participant',
        {
          required: true,
        },
      )
      round1PublicPackages = input.split(',')

      if (round1PublicPackages.length < 2) {
        this.error(
          'Must include a public package for each participant; at least 2 participants required',
        )
      }
    }
    round1PublicPackages = round1PublicPackages.map((i) => i.trim())

    const client = await this.sdk.connectRpc()

    const response = await client.wallet.multisig.dkg.round2({
      secretName: flags.secretName,
      encryptedSecretPackage: round1SecretPackage,
      publicPackages: round1PublicPackages,
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
