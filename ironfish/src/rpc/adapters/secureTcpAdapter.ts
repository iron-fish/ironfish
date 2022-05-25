/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import fs from 'fs'
import net from 'net'
import tls from 'tls'
import { createRootLogger, Logger } from '../../logger'
import { ApiNamespace } from '../routes'
import { TcpAdapter } from './tcpAdapter'

export class SecureTcpAdapter extends TcpAdapter {
  readonly nodeKeyPath: string
  readonly nodeCertPath: string

  constructor(
    host: string,
    port: number,
    nodeKeyPath: string,
    nodeCertPath: string,
    logger: Logger = createRootLogger(),
    namespaces: ApiNamespace[],
  ) {
    super(host, port, logger, namespaces)
    this.nodeKeyPath = nodeKeyPath
    this.nodeCertPath = nodeCertPath
  }

  protected createServer(): net.Server {
    const options = {
      host: this.host,
      port: this.port,
      key: fs.readFileSync(this.nodeKeyPath),
      cert: fs.readFileSync(this.nodeCertPath),
      rejectUnauthorized: false,
    }

    return tls.createServer(options, (socket) => this.onClientConnection(socket))
  }
}
