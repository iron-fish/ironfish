/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { pki } from 'node-forge'
import tls from 'tls'
import { FileSystem } from '../../fileSystems'
import { createRootLogger, Logger } from '../../logger'
import { ApiNamespace } from '../routes'
import { TcpAdapter } from './tcpAdapter'

export class SecureTcpAdapter extends TcpAdapter {
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

  async start(): Promise<void> {
    const server = tls.createServer(await this.getTlsOptions(), (socket) =>
      this.onClientConnection(socket),
    )
    this.server = server

    return new Promise((resolve, reject) => {
      server.on('error', (err) => {
        reject(err)
      })

      server.listen(
        {
          host: this.host,
          port: this.port,
          exclusive: true,
        },
        () => {
          resolve()
        },
      )
    })
  }

  protected async getTlsOptions(): Promise<tls.TlsOptions> {
    const nodeKeyExists = await this.fileSystem.exists(this.nodeKeyPath)
    const nodeCertExists = await this.fileSystem.exists(this.nodeCertPath)
    if (nodeKeyExists && nodeCertExists) {
      const nodeKey = await this.fileSystem.readFile(this.nodeKeyPath)
      const nodeCert = await this.fileSystem.readFile(this.nodeCertPath)
      return {
        key: nodeKey,
        cert: nodeCert,
      }
    } else {
      this.logger.error(
        `Missing TLS key and/or cert files at ${this.nodeKeyPath} and ${this.nodeCertPath}. Automatically generating key and self-signed cert`,
      )
      return this.generateTlsOptions()
    }
  }

  protected generateTlsOptions(): tls.TlsOptions {
    const keyPair = pki.rsa.generateKeyPair(2048)
    const cert = pki.createCertificate()
    cert.publicKey = keyPair.publicKey
    cert.sign(keyPair.privateKey)
    const nodeKeyPem = pki.privateKeyToPem(keyPair.privateKey)
    const nodeCertPem = pki.certificateToPem(cert)
    void this.fileSystem.writeFile(this.nodeKeyPath, nodeKeyPem)
    void this.fileSystem.writeFile(this.nodeCertPath, nodeCertPem)
    return {
      key: nodeKeyPem,
      cert: nodeCertPem,
    }
  }
}
