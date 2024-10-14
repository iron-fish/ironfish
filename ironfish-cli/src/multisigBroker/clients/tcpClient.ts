/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Logger } from '@ironfish/sdk'
import net from 'net'
import { MultisigClient } from './client'

export class MultisigTcpClient extends MultisigClient {
  client: net.Socket | null = null

  constructor(options: { hostname: string; port: number; logger: Logger }) {
    super({
      hostname: options.hostname,
      port: options.port,
      logger: options.logger,
    })
  }

  protected onSocketDisconnect = (): void => {
    this.client?.off('error', this.onError)
    this.client?.off('close', this.onSocketDisconnect)
    this.client?.off('data', this.onSocketData)
    this.onDisconnect()
  }

  protected onSocketData = (data: Buffer): void => {
    this.onData(data).catch((e) => this.onError(e))
  }

  protected connect(): Promise<void> {
    return new Promise((resolve, reject): void => {
      const onConnect = () => {
        client.off('connect', onConnect)
        client.off('error', onError)

        client.on('error', this.onError)
        client.on('close', this.onSocketDisconnect)

        resolve()
      }

      const onError = (error: unknown) => {
        client.off('connect', onConnect)
        client.off('error', onError)
        reject(error)
      }

      const client = new net.Socket()
      client.on('error', onError)
      client.on('connect', onConnect)
      client.on('data', this.onSocketData)
      client.connect({ host: this.hostname, port: this.port })
      this.client = client
    })
  }

  protected writeData(data: string): void {
    this.client?.write(data)
  }

  protected close(): Promise<void> {
    this.client?.destroy()
    return Promise.resolve()
  }
}
