/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Logger } from '@ironfish/sdk'
import net from 'net'
import tls from 'tls'
import { MultisigTcpAdapter } from './tcpAdapter'

export class MultisigTlsAdapter extends MultisigTcpAdapter {
  readonly tlsOptions: tls.TlsOptions

  constructor(options: {
    logger: Logger
    host: string
    port: number
    tlsOptions: tls.TlsOptions
  }) {
    super(options)

    this.tlsOptions = options.tlsOptions
  }

  protected createServer(): net.Server {
    this.logger.info(`Hosting Multisig Server via TLS on ${this.host}:${this.port}`)

    return tls.createServer(this.tlsOptions, (socket) =>
      this.multisigServer?.onConnection(socket),
    )
  }
}
