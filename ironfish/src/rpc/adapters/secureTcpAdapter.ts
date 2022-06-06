/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import net from 'net'
import tls from 'tls'
import { createRootLogger, Logger } from '../../logger'
import { ApiNamespace } from '../routes'
import { TcpAdapter } from './tcpAdapter'

export class SecureTcpAdapter extends TcpAdapter {
  readonly nodeKey: string
  readonly nodeCert: string

  constructor(
    host: string,
    port: number,
    nodeKey: string,
    nodeCert: string,
    logger: Logger = createRootLogger(),
    namespaces: ApiNamespace[],
  ) {
    super(host, port, logger, namespaces)
    this.nodeKey = nodeKey
    this.nodeCert = nodeCert
  }

  protected createServer(): net.Server {
    const options = {
      host: this.host,
      port: this.port,
      key: this.nodeKey,
      cert: this.nodeCert,
    }

    return tls.createServer(options, (socket) => this.onClientConnection(socket))
  }
}
