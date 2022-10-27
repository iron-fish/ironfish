/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import net from 'net'
import { createRootLogger, Logger } from '../../logger'
import { ApiNamespace } from '../routes'
import { RpcSocketAdapter } from './socketAdapter/socketAdapter'

export class RpcIpcAdapter extends RpcSocketAdapter {
  constructor(path: string, logger: Logger = createRootLogger(), namespaces: ApiNamespace[]) {
    super({ path }, logger.withTag('ipcadapter'), namespaces)
    this.enableAuthentication = false
  }

  protected createServer(): net.Server {
    return net.createServer((socket) => this.onClientConnection(socket))
  }
}
