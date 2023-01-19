/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { S3Client } from '@aws-sdk/client-s3'
import { ErrorUtils, Logger, SetTimeoutToken } from '@ironfish/sdk'
import net from 'net'
import { v4 as uuid } from 'uuid'
import { S3Utils } from '../utils'
import { CeremonyClientMessage, CeremonyServerMessage } from './schema'

type CurrentContributor = {
  state: 'STARTED' | 'UPLOADING'
  client: CeremonyServerClient
}

class CeremonyServerClient {
  id: string
  socket: net.Socket
  connected: boolean

  static JOIN_TIMEOUT_MS = 5000

  private joinTimeout: SetTimeoutToken | null = null

  constructor(options: { socket: net.Socket; id: string }) {
    this.id = options.id
    this.socket = options.socket
    this.connected = true

    this.joinTimeout = setTimeout(() => {
      this.close(new Error('Failed to send join message'))
    }, CeremonyServerClient.JOIN_TIMEOUT_MS)
  }

  joined(queueLocation: number) {
    this.joinTimeout && clearTimeout(this.joinTimeout)
    this.joinTimeout = null

    const message: CeremonyServerMessage = { method: 'joined', queueLocation }
    this.send(JSON.stringify(message))
  }

  private send(message: string): void {
    this.socket.write(message + '\n')
  }

  close(error?: Error): void {
    if (!this.connected) {
      return
    }

    this.connected = false
    this.joinTimeout && clearTimeout(this.joinTimeout)
    this.joinTimeout = null
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

  readonly s3Bucket: string
  private s3Client: S3Client

  private queue: CeremonyServerClient[]

  private currentContributor: CurrentContributor | null = null

  constructor(options: {
    logger: Logger
    port: number
    host: string
    s3Bucket: string
    s3Client: S3Client
  }) {
    this.logger = options.logger
    this.queue = []

    this.host = options.host
    this.port = options.port

    this.s3Bucket = options.s3Bucket
    this.s3Client = options.s3Client

    this.server = net.createServer((s) => this.onConnection(s))
  }

  async start(): Promise<void> {
    const items = await S3Utils.getBucketObjects(this.s3Client, this.s3Bucket)

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

    socket.on('data', (data: Buffer) => this.onData(client, data))
    socket.on('close', () => this.onDisconnect(client))
    socket.on('error', (e) => this.onError(client, e))

    this.logger.info(`Client ${client.id} connected`)
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
      `Client ${client.id} disconnected with error '${ErrorUtils.renderError(e)}'. (${
        this.queue.length
      } total)`,
    )
  }

  private onData(client: CeremonyServerClient, data: Buffer): void {
    const message = data.toString('utf-8')

    let parsedMessage
    try {
      parsedMessage = JSON.parse(message) as CeremonyClientMessage
    } catch {
      this.logger.debug(`Received unknown message: ${message}`)
      return
    }

    if (parsedMessage.method === 'join') {
      this.queue.push(client)
      client.joined(this.queue.length)

      this.logger.info(`Client ${client.id} joined the queue (${this.queue.length} total)`)
    } else {
      this.logger.info(`Client ${client.id} sent message: ${message}`)
    }
  }
}
