/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import { WebApi } from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../../command'

export class Deposit extends IronfishCommand {
  static description = `Deposit coins to the bridge`

  static flags = {
    endpoint: Flags.string({
      char: 'e',
      description: 'API host to sync to',
      parse: (input: string) => Promise.resolve(input.trim()),
      env: 'IRONFISH_API_HOST',
    }),
    token: Flags.string({
      char: 't',
      description: 'API token to authenticate with',
      parse: (input: string) => Promise.resolve(input.trim()),
      env: 'IRONFISH_API_TOKEN',
    }),
    assetId: Flags.string({
      char: 'i',
      description: 'The identifier for the asset to deposit',
    }),
    source: Flags.string({
      description: 'Iron Fish public address to deposit from',
      required: true,
    }),
    dest: Flags.string({
      description: 'Eth public address to deposit to',
      required: true,
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(Deposit)

    if (!flags.endpoint) {
      this.log(
        `No api host set. You must set IRONFISH_API_HOST env variable or pass --endpoint flag.`,
      )
      this.exit(1)
    }

    if (!flags.token) {
      this.log(
        `No api token set. You must set IRONFISH_API_TOKEN env variable or pass --token flag.`,
      )
      this.exit(1)
    }

    const api = new WebApi({ host: flags.endpoint, token: flags.token })

    const assetId = flags.assetId ?? Asset.nativeId().toString('hex')

    const response = await api.createDeposit({
      asset: assetId,
      source_address: flags.source,
      destination_address: flags.dest,
    })

    const depositId = response[flags.source]

    this.log(`Deposit memo: ${depositId}`)
  }
}
