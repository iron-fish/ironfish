/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import net from 'net'
import { pki } from 'node-forge'
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
    logger: Logger = createRootLogger(),
    namespaces: ApiNamespace[],
  ) {
    super(host, port, logger, namespaces)
    const keyPair = pki.rsa.generateKeyPair(2048)
    this.nodeKey = pki.privateKeyToPem(keyPair.privateKey)
    this.nodeCert = this.generateCertificatePem(keyPair)
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

  protected generateCertificatePem(keyPair: pki.KeyPair): string {
    const cert = pki.createCertificate()
    cert.publicKey = keyPair.publicKey
    cert.sign(keyPair.privateKey)
    return pki.certificateToPem(cert)
  }
}
