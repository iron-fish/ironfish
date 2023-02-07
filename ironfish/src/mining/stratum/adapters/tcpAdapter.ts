/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import net from 'net'
import { Logger } from '../../../logger'
import { StratumServer } from '../stratumServer'
import { IStratumAdapter } from './adapter'

export class StratumTcpAdapter implements IStratumAdapter {
  server: net.Server | null = null
  stratumServer: StratumServer | null = null
  readonly logger: Logger

  readonly host: string
  readonly port: number

  started = false

  constructor(options: { logger: Logger; host: string; port: number }) {
    this.logger = options.logger
    this.host = options.host
    this.port = options.port
  }

  protected createServer(): net.Server {
    this.logger.info(`Hosting Stratum via TCP on ${this.host}:${this.port}`)

    return net.createServer((socket) => this.stratumServer?.onConnection(socket))
  }

  start(): Promise<void> {
    if (this.started) {
      return Promise.resolve()
    }

    this.started = true

    return new Promise((resolve, reject) => {
      try {
        this.server = this.createServer()
        this.server.listen(this.port, this.host, () => {
          resolve()
        })
      } catch (e) {
        reject(e)
      }
    })
  }

  stop(): Promise<void> {
    if (!this.started) {
      return Promise.resolve()
    }

    return new Promise((resolve, reject) => {
      this.server?.close((e) => {
        return e ? reject(e) : resolve()
      })
    })
  }

  attach(server: StratumServer): void {
    this.stratumServer = server
  }
}
