/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ErrorUtils, Logger } from '@ironfish/sdk'
import net from 'net'
import { v4 as uuid } from 'uuid'

type CurrentContributor = {
  state: 'STARTED' | 'UPLOADING'
  client: CeremonyServerClient
}

class CeremonyServerClient {
  id: string
  socket: net.Socket
  connected: boolean

  constructor(options: { socket: net.Socket; id: string }) {
    this.id = options.id
    this.socket = options.socket
    this.connected = true
  }

  close(error?: Error): void {
    if (!this.connected) {
      return
    }

    this.connected = false
    this.socket.removeAllListeners()
    this.socket.destroy(error)
  }
}

export class CeremonyServer {
  readonly server: net.Server
  readonly logger: Logger

  private stopPromise: Promise<void> | null = null
  private stopResolve: (() => void) | null = null

  readonly port: number
  readonly host: string

  private queue: CeremonyServerClient[]

  private currentContributor: CurrentContributor | null = null

  constructor(options: { logger: Logger; port: number; host: string }) {
    this.logger = options.logger
    this.queue = []

    this.host = options.host
    this.port = options.port

    this.server = net.createServer((s) => this.onConnection(s))
  }

  start(): void {
    this.stopPromise = new Promise((r) => (this.stopResolve = r))
    this.server.listen(this.port, this.host)
    this.logger.info(`Server started at ${this.host}:${this.port}`)
  }

  stop(): void {
    this.server.close()
    this.stopResolve && this.stopResolve()
    this.stopPromise = null
    this.stopResolve = null
    this.logger.info(`Server stopped on ${this.host}:${this.port}`)
  }

  async waitForStop(): Promise<void> {
    await this.stopPromise
  }

  private onConnection(socket: net.Socket): void {
    const client = new CeremonyServerClient({ socket, id: uuid() })
    this.queue.push(client)

    socket.on('data', (data: Buffer) => this.onData(client, data))
    socket.on('close', () => this.onDisconnect(client))
    socket.on('error', (e) => this.onError(client, e))

    this.logger.info(
      `New participant joined: ${socket.remoteAddress || 'undefined'} (${
        this.queue.length
      } total)`,
    )
  }

  private onDisconnect(client: CeremonyServerClient): void {
    client.close()
    this.queue = this.queue.filter((c) => client.id !== c.id)
    this.logger.info(`Client ${client.id} disconnected (${this.queue.length} total)`)
  }

  private onError(client: CeremonyServerClient, e: Error): void {
    client.close(e)
    this.queue = this.queue.filter((c) => client.id === c.id)
    this.logger.info(
      `Client ${client.id} disconnected with error ${ErrorUtils.renderError(e)}. (${
        this.queue.length
      } total)`,
    )
  }

  private onData(client: CeremonyServerClient, data: Buffer): void {
    const message = data.toString('utf-8')
    this.logger.info(`Client ${client.id} sent message: ${message}`)
  }
}
