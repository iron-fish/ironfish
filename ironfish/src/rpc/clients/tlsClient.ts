/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import tls from 'tls'
import { Assert } from '../../assert'
import { ErrorUtils } from '../../utils'
import { RpcConnectionLostError, RpcConnectionRefusedError } from './errors'
import { RpcTcpClient } from './tcpClient'

export class RpcTlsClient extends RpcTcpClient {
  async connect(): Promise<void> {
    this.logger.debug(`Connecting to ${this.describe()}`)

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

        if (ErrorUtils.isConnectRefusedError(error) || ErrorUtils.isNoEntityError(error)) {
          reject(new RpcConnectionRefusedError())
        } else if (
          ErrorUtils.isConnectTimeOutError(error) ||
          ErrorUtils.isConnectResetError(error)
        ) {
          reject(new RpcConnectionLostError())
        } else {
          reject(error)
        }
      }

      const options = {
        rejectUnauthorized: false,
      }

      Assert.isNotUndefined(this.connectTo.host)
      Assert.isNotUndefined(this.connectTo.port)

      const client = tls.connect(this.connectTo.port, this.connectTo.host, options)
      client.on('error', onError)
      client.on('secureConnect', onSecureConnect)
      this.client = client
    })
  }
}
