/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { TlsUtils } from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../../command'
import { MultisigServer } from '../../../multisigBroker'
import {
  IMultisigBrokerAdapter,
  MultisigTcpAdapter,
  MultisigTlsAdapter,
} from '../../../multisigBroker/adapters'

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
    tls: Flags.boolean({
      description: 'enable TLS on the multisig server',
      allowNo: true,
      default: true,
    }),
    idleSessionTimeout: Flags.integer({
      description: 'time (in ms) to wait before cleaning up idle session data',
      char: 'i',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(MultisigServerCommand)

    const server = new MultisigServer({
      logger: this.logger,
      idleSessionTimeout: flags.idleSessionTimeout,
    })

    let adapter: IMultisigBrokerAdapter
    if (flags.tls) {
      const fileSystem = this.sdk.fileSystem
      const nodeKeyPath = this.sdk.config.get('tlsKeyPath')
      const nodeCertPath = this.sdk.config.get('tlsCertPath')
      const tlsOptions = await TlsUtils.getTlsOptions(
        fileSystem,
        nodeKeyPath,
        nodeCertPath,
        this.logger,
      )

      adapter = new MultisigTlsAdapter({
        logger: this.logger,
        host: flags.host,
        port: flags.port,
        tlsOptions,
      })
    } else {
      adapter = new MultisigTcpAdapter({
        logger: this.logger,
        host: flags.host,
        port: flags.port,
      })
    }

    server.mount(adapter)
    await server.start()
  }
}
