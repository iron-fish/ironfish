/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { CeremonyClient } from '../../trusted-setup/client'

export default class Participate extends IronfishCommand {
  static hidden = true

  static description = `
     Start the coordination server for the Iron Fish trusted setup ceremony
   `

  static flags = {
    ...RemoteFlags,
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(Participate)

    const DEFAULT_HOST = 'ec2-3-142-140-72.us-east-2.compute.amazonaws.com'
    const DEFAULT_PORT = 9040

    const client = new CeremonyClient({
      logger: this.logger,
      port: DEFAULT_PORT,
      host: DEFAULT_HOST,
    })

    await client.start()
    await new Promise<void>((r) => setTimeout(() => r(), 5000))
  }
}
