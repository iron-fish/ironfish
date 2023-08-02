/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomBytes } from 'crypto'
import net from 'net'
import tls from 'tls'
import { FileSystem } from '../../fileSystems'
import { createRootLogger, Logger } from '../../logger'
import { FullNode } from '../../node'
import { TlsUtils } from '../../utils/tls'
import { ApiNamespace } from '../routes'
import { RpcSocketAdapter } from './socketAdapter/socketAdapter'

export class RpcTlsAdapter extends RpcSocketAdapter {
  readonly fileSystem: FileSystem
  readonly nodeKeyPath: string
  readonly nodeCertPath: string
  node: FullNode

  constructor(
    host: string,
    port: number,
    fileSystem: FileSystem,
    nodeKeyPath: string,
    nodeCertPath: string,
    node: FullNode,
    logger: Logger = createRootLogger(),
    namespaces: ApiNamespace[],
  ) {
    super({ host, port }, logger, namespaces)
    this.fileSystem = fileSystem
    this.nodeKeyPath = nodeKeyPath
    this.nodeCertPath = nodeCertPath
    this.node = node
    this.enableAuthentication = true
  }

  protected async createServer(): Promise<net.Server> {
    const rpcAuthToken = this.node.internal.get('rpcAuthToken')

    if (!rpcAuthToken || rpcAuthToken === '') {
      this.logger.debug(
        `Missing RPC Auth token in internal.json config. Automatically generating auth token.`,
      )
      const newPassword = randomBytes(32).toString('hex')
      this.node.internal.set('rpcAuthToken', newPassword)
      await this.node.internal.save()
    }

    const options = await TlsUtils.getTlsOptions(
      this.fileSystem,
      this.nodeKeyPath,
      this.nodeCertPath,
      this.logger,
    )

    return tls.createServer(options, (socket) => this.onClientConnection(socket))
  }
}
