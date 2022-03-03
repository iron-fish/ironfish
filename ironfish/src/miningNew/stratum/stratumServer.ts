/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import net from 'net'
import { Assert } from '../../assert'
import { createRootLogger, Logger } from '../../logger'
import { SerializedBlockTemplate } from '../../serde/BlockTemplateSerde'
import { ErrorUtils } from '../../utils/error'
import { YupUtils } from '../../utils/yup'
import { MiningPool } from '../pool'
import { mineableHeaderString } from '../utils'
import { ClientMessageMalformedError } from './errors'
import {
  MiningNotifyMessage,
  MiningSetTargetMessage,
  MiningSubmitSchema,
  MiningSubscribedMessage,
  MiningSubscribeSchema,
  StratumMessage,
  StratumMessageSchema,
} from './messages'

export class StratumServerClient {
  id: number
  socket: net.Socket
  graffiti: Buffer | null = null
  connected: boolean
  subscribed: boolean

  private constructor(options: { socket: net.Socket; id: number }) {
    this.id = options.id
    this.socket = options.socket
    this.connected = true
    this.subscribed = false
  }

  static accept(socket: net.Socket, id: number): StratumServerClient {
    return new StratumServerClient({ socket, id })
  }

  close(error?: Error): void {
    if (!this.connected) {
      return
    }

    this.connected = false
    this.socket.destroy(error)
  }
}

export class StratumServer {
  readonly server: net.Server
  readonly pool: MiningPool
  readonly logger: Logger

  clients: Map<number, StratumServerClient>
  nextMinerId: number
  nextMessageId: number

  currentWork: Buffer | null = null
  currentMiningRequestId: number | null = null

  constructor(options: { pool: MiningPool; logger?: Logger }) {
    this.pool = options.pool
    this.logger = options.logger ?? createRootLogger()

    this.clients = new Map()
    this.nextMinerId = 0
    this.nextMessageId = 0

    this.server = net.createServer((s) => this.onConnection(s))
  }

  start(): void {
    this.server.listen(1234, 'localhost')
  }

  stop(): void {
    this.server.close()
  }

  newWork(miningRequestId: number, block: SerializedBlockTemplate): void {
    this.currentMiningRequestId = miningRequestId
    this.currentWork = mineableHeaderString(block.header)

    this.logger.info(
      'Setting work for request:',
      this.currentMiningRequestId,
      `${this.currentWork.toString('hex').slice(0, 50)}...`,
    )

    this.broadcast('mining.notify', this.getNotifyMessage())
  }

  waitForWork(): void {
    this.broadcast('mining.wait_for_work')
  }

  hasWork(): boolean {
    return this.currentWork != null
  }

  private onConnection(socket: net.Socket): void {
    const client = StratumServerClient.accept(socket, this.nextMinerId++)

    socket.on('data', (data: Buffer) => {
      this.onData(client, data).catch((e) => this.onError(client, e))
    })

    socket.on('close', () => this.onDisconnect(client))

    this.logger.info(`Client ${client.id} connected:`, socket.remoteAddress)
    this.clients.set(client.id, client)
  }

  private onDisconnect(client: StratumServerClient): void {
    this.logger.info(`Client ${client.id} disconnected`)
    client.socket.removeAllListeners()
    this.clients.delete(client.id)
  }

  private async onData(client: StratumServerClient, data: Buffer): Promise<void> {
    const splits = data.toString('utf-8').trim().split('\n')

    for (const split of splits) {
      const payload: unknown = JSON.parse(split)

      const header = await YupUtils.tryValidate(StratumMessageSchema, payload)

      if (header.error) {
        throw new ClientMessageMalformedError(client, header.error)
      }

      this.logger.debug(`Client ${client.id} sent ${header.result.method} message`)

      switch (header.result.method) {
        case 'mining.subscribe': {
          const body = await YupUtils.tryValidate(MiningSubscribeSchema, header.result.body)

          if (body.error) {
            throw new ClientMessageMalformedError(client, body.error, header.result.method)
          }

          client.graffiti = Buffer.from(body.result.graffiti, 'hex')
          client.subscribed = true

          this.send(client, 'mining.subscribed', { clientId: client.id })
          this.send(client, 'mining.set_target', this.getSetTargetMessage())

          if (this.hasWork()) {
            this.send(client, 'mining.notify', this.getNotifyMessage())
          }

          break
        }

        case 'mining.submit': {
          const body = await YupUtils.tryValidate(MiningSubmitSchema, header.result.body)

          if (body.error) {
            throw new ClientMessageMalformedError(client, body.error)
          }

          const submittedRequestId = body.result.miningRequestId
          const submittedRandomness = body.result.randomness
          const submittedGraffiti = Buffer.from(body.result.graffiti, 'hex')

          void this.pool.submitWork(
            client,
            submittedRequestId,
            submittedRandomness,
            submittedGraffiti,
          )

          break
        }

        default:
          throw new ClientMessageMalformedError(
            client,
            `Invalid message ${header.result.method}`,
          )
      }
    }
  }

  private onError(client: StratumServerClient, error: unknown): void {
    this.logger.warn(
      `Error during handling of data from client ${client.id}: ${ErrorUtils.renderError(
        error,
        true,
      )}`,
    )

    client.close()
  }

  private getNotifyMessage(): MiningNotifyMessage {
    Assert.isNotNull(this.currentMiningRequestId)
    Assert.isNotNull(this.currentWork)

    return {
      miningRequestId: this.currentMiningRequestId,
      header: this.currentWork?.toString('hex'),
    }
  }

  private getSetTargetMessage(): MiningSetTargetMessage {
    return {
      target: this.pool.getTarget(),
    }
  }

  private broadcast(method: 'mining.wait_for_work'): void
  private broadcast(method: 'mining.notify', body: MiningNotifyMessage): void
  private broadcast(method: string, body?: unknown): void {
    const message: StratumMessage = {
      id: this.nextMessageId++,
      method: method,
      body: body,
    }

    const serialized = JSON.stringify(message) + '\n'

    for (const client of this.clients.values()) {
      client.socket.write(serialized)
    }
  }
  private send(
    client: StratumServerClient,
    method: 'mining.notify',
    body: MiningNotifyMessage,
  ): void
  private send(
    client: StratumServerClient,
    method: 'mining.set_target',
    body: MiningSetTargetMessage,
  ): void
  private send(
    client: StratumServerClient,
    method: 'mining.subscribed',
    body: MiningSubscribedMessage,
  ): void
  private send(client: StratumServerClient, method: string, body?: unknown): void {
    const message: StratumMessage = {
      id: this.nextMessageId++,
      method: method,
      body: body,
    }

    const serialized = JSON.stringify(message) + '\n'
    client.socket.write(serialized)
  }
}
