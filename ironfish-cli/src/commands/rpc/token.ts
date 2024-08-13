/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { JsonFlags } from '../../flags'

export default class Token extends IronfishCommand {
  static description = 'get or set the RPC auth token'
  static enableJsonFlag = true

  static flags = {
    ...JsonFlags,
    token: Flags.string({
      required: false,
      description: 'Set the RPC auth token to <value>',
    }),
  }

  async start(): Promise<unknown> {
    const { flags } = await this.parse(Token)

    const internal = this.sdk.internal

    const token = internal.get('rpcAuthToken')

    if (flags.token) {
      internal.set('rpcAuthToken', flags.token)
      await internal.save()

      this.log(`RPC auth token changed from ${token} to ${flags.token}`)
    } else {
      if (token) {
        this.log(`RPC auth token: ${token}`)
      } else {
        this.log('No RPC auth token found.')
      }
    }

    return { rpcAuthToken: token }
  }
}
