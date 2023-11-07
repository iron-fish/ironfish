/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import net from 'net'
import tls from 'tls'
import { FileSystem } from '../../fileSystems'
import { createRootLogger, Logger } from '../../logger'
import { TlsUtils } from '../../utils/tls'
import { ApiNamespace } from '../routes'
import { RpcSocketAdapter } from './socketAdapter/socketAdapter'

export class RpcTlsAdapter extends RpcSocketAdapter {
  readonly fileSystem: FileSystem
  readonly nodeKeyPath: string
  readonly nodeCertPath: string

  constructor(
    host: string,
    port: number,
    fileSystem: FileSystem,
    nodeKeyPath: string,
    nodeCertPath: string,
    logger: Logger = createRootLogger(),
    namespaces: ApiNamespace[],
  ) {
    super({ host, port }, logger, namespaces)
    this.fileSystem = fileSystem
    this.nodeKeyPath = nodeKeyPath
    this.nodeCertPath = nodeCertPath
    this.enableAuthentication = true
  }

  protected async createServer(): Promise<net.Server> {
    const options = await TlsUtils.getTlsOptions(
      this.fileSystem,
      this.nodeKeyPath,
      this.nodeCertPath,
      this.logger,
    )

    return tls.createServer(options, (socket) => this.onClientConnection(socket))
  }
}
