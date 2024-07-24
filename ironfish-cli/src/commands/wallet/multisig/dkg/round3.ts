/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../../../command'
import { RemoteFlags } from '../../../../flags'
import { inputPrompt } from '../../../../ui'
import { longPrompt } from '../../../../utils/input'
import { selectSecret } from '../../../../utils/multisig'

export class DkgRound3Command extends IronfishCommand {
  static description = 'Perform round3 of the DKG protocol for multisig account creation'

  static flags = {
    ...RemoteFlags,
    participantName: Flags.string({
      char: 'n',
      description: 'The name of the secret to use for decryption during DKG',
      aliases: ['name'],
    }),
    accountName: Flags.string({
      char: 'a',
      description: 'The name to set for the imported account',
    }),
    round2SecretPackage: Flags.string({
      char: 'e',
      description: 'The encrypted secret package created during DKG round 2',
    }),
    round1PublicPackages: Flags.string({
      char: 'p',
      description:
        'The public package that a participant generated during DKG round 1 (may be specified multiple times for multiple participants). Must include your own round 1 public package',
      multiple: true,
    }),
    round2PublicPackages: Flags.string({
      char: 'q',
      description:
        'The public package that a participant generated during DKG round 2 (may be specified multiple times for multiple participants). Your own round 2 public package is optional; if included, it will be ignored',
      multiple: true,
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(DkgRound3Command)

    const client = await this.connectRpc()

    let participantName = flags.participantName
    if (!participantName) {
      participantName = await selectSecret(client)
    }

    let round2SecretPackage = flags.round2SecretPackage
    if (!round2SecretPackage) {
      round2SecretPackage = await inputPrompt(
        `Enter the round 2 encrypted secret package for participant ${participantName}`,
        true,
      )
    }

    let round1PublicPackages = flags.round1PublicPackages
    if (!round1PublicPackages || round1PublicPackages.length < 2) {
      const input = await longPrompt(
        'Enter round 1 public packages, separated by commas, one for each participant',
        {
          required: true,
        },
      )
      round1PublicPackages = input.split(',')

      if (round1PublicPackages.length < 2) {
        this.error(
          'Must include a round 1 public package for each participant; at least 2 participants required',
        )
      }
    }
    round1PublicPackages = round1PublicPackages.map((i) => i.trim())

    let round2PublicPackages = flags.round2PublicPackages
    if (!round2PublicPackages) {
      const input = await longPrompt(
        'Enter round 2 public packages, separated by commas, one for each participant',
        {
          required: true,
        },
      )
      round2PublicPackages = input.split(',')

      // Our own public package is optional in this step (if provided, it will
      // be ignored), so we can accept both `n` and `n-1` packages
      if (
        round2PublicPackages.length < round1PublicPackages.length - 1 ||
        round2PublicPackages.length > round1PublicPackages.length
      ) {
        // Suggest to provide `n-1` packages; don't mention the `n` case to
        // avoid making the error message too hard to decipher.
        this.error(
          'The number of round 2 public packages should be 1 less than the number of round 1 public packages',
        )
      }
    }
    round2PublicPackages = round2PublicPackages.map((i) => i.trim())

    const response = await client.wallet.multisig.dkg.round3({
      participantName,
      accountName: flags.accountName,
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
