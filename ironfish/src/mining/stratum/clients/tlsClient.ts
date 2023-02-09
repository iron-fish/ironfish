/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import tls from 'tls'
import { StratumTcpClient } from './tcpClient'

export class StratumTlsClient extends StratumTcpClient {
  protected connect(): Promise<void> {
    return new Promise((resolve, reject): void => {
      const onConnect = () => {
        client.off('secureConnect', onConnect)
        client.off('error', onError)

        client.on('error', this.onError)
        client.on('close', this.onSocketDisconnect)

        resolve()
      }

      const onError = (error: unknown) => {
        client.off('secureConnect', onConnect)
        client.off('error', onError)
        reject(error)
      }

      const client = tls.connect({
        host: this.host,
        port: this.port,
        rejectUnauthorized: false,
      })
      client.on('error', onError)
      client.on('secureConnect', onConnect)
      client.on('data', this.onSocketData)
      this.client = client
    })
  }
}
