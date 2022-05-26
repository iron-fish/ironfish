/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import tls from 'tls'
import { createRootLogger, Logger } from '../../logger'
import { ErrorUtils } from '../../utils'
import { ConnectionRefusedError } from './errors'
import { IronfishTcpClient } from './tcpClient'

export class IronfishSecureTcpClient extends IronfishTcpClient {
  private readonly nodeCert: string

  constructor(
    host: string,
    port: number,
    nodeCert: string,
    logger: Logger = createRootLogger(),
    retryConnect = false,
  ) {
    super(host, port, logger, retryConnect)
    this.nodeCert = nodeCert
  }

  async connectClient(): Promise<void> {
    return new Promise((resolve, reject): void => {
      const onSecureConnect = () => {
        client.off('secureConnection', onSecureConnect)
        client.off('error', onError)
        this.onConnect()
        resolve()
      }

      const onError = (error: unknown) => {
        client.off('secureConnection', onSecureConnect)
        client.off('error', onError)
        if (ErrorUtils.isConnectRefusedError(error)) {
          reject(new ConnectionRefusedError())
        } else if (ErrorUtils.isNoEntityError(error)) {
          reject(new ConnectionRefusedError())
        } else {
          reject(error)
        }
      }

      const options = {
        // allows self-signed cert from the server
        ca: [this.nodeCert],

        // allows cert for remote non-'localhost' server
        checkServerIdentity: () => {
          return undefined
        },
      }

      this.logger.debug(`Connecting to ${String(this.host)}:${String(this.port)}`)
      const client = tls.connect(this.port, this.host, options, onSecureConnect)
      client.on('error', onError)
      this.client = client
    })
  }
}
