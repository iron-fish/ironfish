/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import net from 'net'
import { pki } from 'node-forge'
import tls from 'tls'
import { FileSystem } from '../../fileSystems'
import { createRootLogger, Logger } from '../../logger'
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
    super(host, port, logger, namespaces)
    this.fileSystem = fileSystem
    this.nodeKeyPath = nodeKeyPath
    this.nodeCertPath = nodeCertPath
  }

  protected async createServer(): Promise<net.Server> {
    const options = await this.getTlsOptions()
    return tls.createServer(options, (socket) => this.onClientConnection(socket))
  }

  protected async getTlsOptions(): Promise<tls.TlsOptions> {
    const nodeKeyExists = await this.fileSystem.exists(this.nodeKeyPath)
    const nodeCertExists = await this.fileSystem.exists(this.nodeCertPath)

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
    const nodeCertPath = this.fileSystem.dirname(this.nodeCertPath)

    await this.fileSystem.mkdir(nodeKeyDir, { recursive: true })
    await this.fileSystem.mkdir(nodeCertPath, { recursive: true })

    await this.fileSystem.writeFile(this.nodeKeyPath, nodeKeyPem)
    await this.fileSystem.writeFile(this.nodeCertPath, nodeCertPem)

    return { key: nodeKeyPem, cert: nodeCertPem }
  }
}
