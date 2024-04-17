/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CliUx, Flags } from '@oclif/core'
import { IronfishCommand } from '../../../../command'
import { RemoteFlags } from '../../../../flags'
import { longPrompt } from '../../../../utils/longPrompt'

export class DkgRound3Command extends IronfishCommand {
  static description = 'Perform round3 of the DKG protocol for multisig account creation'
  static hidden = true

  static flags = {
    ...RemoteFlags,
    secretName: Flags.string({
      char: 's',
      description: 'The name of the secret to use for decryption during DKG',
      required: true,
    }),
    round2SecretPackage: Flags.string({
      char: 'e',
      description: 'The encrypted secret package created during DKG round2',
    }),
    round1PublicPackages: Flags.string({
      char: 'p',
      description:
        'The public package that a participant generated during DKG round1 (may be specified multiple times for multiple participants). Must include your own round1 public package',
      multiple: true,
    }),
    round2PublicPackages: Flags.string({
      char: 'q',
      description:
        'The public package that a participant generated during DKG round2 where the recipient matches the identity associated with the secret',
      multiple: true,
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(DkgRound3Command)

    let round2SecretPackage = flags.round2SecretPackage
    if (!round2SecretPackage) {
      round2SecretPackage = await CliUx.ux.prompt(
        `Enter the encrypted secret package for secret ${flags.secretName}`,
        {
          required: true,
        },
      )
    }

    let round1PublicPackages = flags.round1PublicPackages
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

    let round2PublicPackages = flags.round2PublicPackages
    if (!round2PublicPackages) {
      const input = await longPrompt(
        'Enter public packages separated by commas, one for each participant',
        {
          required: true,
        },
      )
      round2PublicPackages = input.split(',')

      if (round2PublicPackages.length !== round1PublicPackages.length - 1) {
        this.error(
          'The number of round 2 public packages must be 1 less than the number of round 1 public packages',
        )
      }
    }
    round2PublicPackages = round2PublicPackages.map((i) => i.trim())

    const client = await this.sdk.connectRpc()

    const response = await client.wallet.multisig.dkg.round3({
      secretName: flags.secretName,
      round2SecretPackage,
      round1PublicPackages,
      round2PublicPackages,
    })

    this.log()
    this.log(
      `Account ${response.content.name} imported with public address: ${response.content.publicAddress}`,
    )
  }
}
