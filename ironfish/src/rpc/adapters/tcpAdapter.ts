/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import net from 'net'
import { createRootLogger, Logger } from '../../logger'
import { ApiNamespace } from '../routes'
import { SocketAdapter } from './socketAdapter/socketAdapter'

export class TcpAdapter extends SocketAdapter {
  constructor(
    host: string,
    port: number,
    logger: Logger = createRootLogger(),
    namespaces: ApiNamespace[],
  ) {
    super(host, port, logger.withTag('tcpadapter'), namespaces)
  }

  protected createServer(): net.Server {
    return net.createServer((socket) => this.onClientConnection(socket))
  }
}
