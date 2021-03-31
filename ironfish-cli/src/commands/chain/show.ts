/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { IronfishCommand } from '../../command'
import { LocalFlags } from '../../flags'

export default class Show extends IronfishCommand {
  static description = 'Show the heaviest chain'

  static flags = {
    ...LocalFlags,
  }

  async start(): Promise<void> {
    this.parse(Show)

    this.log(`Getting the chain blocks...`)
    await this.sdk.client.connect()
    const data = await this.sdk.client.getChain()
    data.content.content.forEach((content) => this.log(content))
  }
}
