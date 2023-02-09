/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import net from 'net'
import tls from 'tls'
import { Logger } from '../../../logger'
import { StratumTcpAdapter } from './tcpAdapter'

export class StratumTlsAdapter extends StratumTcpAdapter {
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
    this.logger.info(`Hosting Stratum via TLS on ${this.host}:${this.port}`)

    return tls.createServer(this.tlsOptions, (socket) =>
      this.stratumServer?.onConnection(socket),
    )
  }
}
