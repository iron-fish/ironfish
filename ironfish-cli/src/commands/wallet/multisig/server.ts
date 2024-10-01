/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../../command'
import { MultisigServer } from '../../../utils/multisig/network'
import { MultisigTcpAdapter } from '../../../utils/multisig/network/adapters'

export class MultisigServerCommand extends IronfishCommand {
  static description = 'start a server to broker messages for a multisig session'

  static flags = {
    host: Flags.string({
      description: 'host address for the multisig server',
      default: '::',
    }),
    port: Flags.integer({
      description: 'port for the multisig server',
      default: 9035,
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(MultisigServerCommand)

    const server = new MultisigServer({ logger: this.logger })

    const adapter = new MultisigTcpAdapter({
      logger: this.logger,
      host: flags.host,
      port: flags.port,
    })

    server.mount(adapter)
    await server.start()
  }
}
