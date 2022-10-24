/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import tls from 'tls'
import { ErrorUtils } from '../../utils'
import { RpcConnectionRefusedError } from './errors'
import { RpcTcpClient } from './tcpClient'

export class RpcTlsClient extends RpcTcpClient {
  async connect(): Promise<void> {
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
          reject(new RpcConnectionRefusedError())
        } else if (ErrorUtils.isNoEntityError(error)) {
          reject(new RpcConnectionRefusedError())
        } else {
          reject(error)
        }
      }

      const options = {
        rejectUnauthorized: false,
      }

      this.logger.debug(`Connecting to ${String(this.host)}:${String(this.port)}`)
      const client = tls.connect(this.port, this.host, options, onSecureConnect)
      client.on('error', onError)
      this.client = client
    })
  }
}
