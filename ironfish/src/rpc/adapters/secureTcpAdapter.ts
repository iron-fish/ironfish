/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import fs from 'fs'
import net from 'net'
import { pki } from 'node-forge'
import tls from 'tls'
import { createRootLogger, Logger } from '../../logger'
import { ErrorUtils } from '../../utils'
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
    return tls.createServer(this.getTlsOptions(), (socket) => this.onClientConnection(socket))
  }

  protected getTlsOptions(): tls.TlsOptions {
    try {
      const nodeKey = fs.readFileSync(this.nodeKeyPath)
      const nodeCert = fs.readFileSync(this.nodeCertPath)
      return {
        key: nodeKey,
        cert: nodeCert,
      }
    } catch (e) {
      if (ErrorUtils.isNoEntityError(e)) {
        this.logger.error(
          `No such TLS cert file ${this.nodeCertPath}. Automatically generating self-signed cert`,
        )
        return this.generateTlsOptions()
      } else {
        throw e
      }
    }
  }

  protected generateTlsOptions(): tls.TlsOptions {
    const keyPair = pki.rsa.generateKeyPair(2048)
    const cert = pki.createCertificate()
    cert.publicKey = keyPair.publicKey
    cert.sign(keyPair.privateKey)
    const nodeKeyPem = pki.privateKeyToPem(keyPair.privateKey)
    const nodeCertPem = pki.certificateToPem(cert)
    fs.writeFileSync(this.nodeKeyPath, nodeKeyPem)
    fs.writeFileSync(this.nodeCertPath, nodeCertPem)
    return {
      key: nodeKeyPem,
      cert: nodeCertPem,
    }
  }
}
