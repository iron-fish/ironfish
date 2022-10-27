/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomBytes } from 'crypto'
import net from 'net'
import { pki } from 'node-forge'
import tls from 'tls'
import { FileSystem } from '../../fileSystems'
import { createRootLogger, Logger } from '../../logger'
import { IronfishNode } from '../../node'
import { ApiNamespace } from '../routes'
import { RpcSocketAdapter } from './socketAdapter/socketAdapter'

export class RpcTlsAdapter extends RpcSocketAdapter {
  readonly fileSystem: FileSystem
  readonly nodeKeyPath: string
  readonly nodeCertPath: string
  node: IronfishNode

  constructor(
    host: string,
    port: number,
    fileSystem: FileSystem,
    nodeKeyPath: string,
    nodeCertPath: string,
    node: IronfishNode,
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
    const options = await this.getTlsOptions()
    return tls.createServer(options, (socket) => this.onClientConnection(socket))
  }

  protected async getTlsOptions(): Promise<tls.TlsOptions> {
    const nodeKeyExists = await this.fileSystem.exists(this.nodeKeyPath)
    const nodeCertExists = await this.fileSystem.exists(this.nodeCertPath)
    const rpcAuthToken = this.node.internal.get('rpcAuthToken')

    if (!rpcAuthToken || rpcAuthToken === '') {
      this.logger.debug(
        `Missing RPC Auth token in internal.json config. Automatically generating auth token.`,
      )
      const newPassword = randomBytes(32).toString('hex')
      this.node.internal.set('rpcAuthToken', newPassword)
      await this.node.internal.save()
    }

    if (!nodeKeyExists || !nodeCertExists) {
      this.logger.debug(
        `Missing TLS key and/or cert files at ${this.nodeKeyPath} and ${this.nodeCertPath}. Automatically generating key and self-signed cert`,
      )

      return await this.generateTlsCerts()
    }

    return {
      key: await this.fileSystem.readFile(this.nodeKeyPath),
      cert: await this.fileSystem.readFile(this.nodeCertPath),
    }
  }

  protected async generateTlsCerts(): Promise<tls.TlsOptions> {
    const keyPair = pki.rsa.generateKeyPair(2048)
    const cert = pki.createCertificate()
    cert.publicKey = keyPair.publicKey
    cert.sign(keyPair.privateKey)

    const nodeKeyPem = pki.privateKeyToPem(keyPair.privateKey)
    const nodeCertPem = pki.certificateToPem(cert)

    const nodeKeyDir = this.fileSystem.dirname(this.nodeKeyPath)
    const nodeCertDir = this.fileSystem.dirname(this.nodeCertPath)

    await this.fileSystem.mkdir(nodeKeyDir, { recursive: true })
    await this.fileSystem.mkdir(nodeCertDir, { recursive: true })

    await this.fileSystem.writeFile(this.nodeKeyPath, nodeKeyPem)
    await this.fileSystem.writeFile(this.nodeCertPath, nodeCertPem)

    return { key: nodeKeyPem, cert: nodeCertPem }
  }
}
