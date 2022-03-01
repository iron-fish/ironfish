/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import net from 'net'
import { Assert } from '../..'
import { createRootLogger, Logger } from '../../logger'
import { SerializedBlockTemplate } from '../../serde/BlockTemplateSerde'
import { MiningPool } from '../pool'
import { mineableHeaderString } from '../utils'
import {
  StratumMessage,
  StratumMessageMiningNotify,
  StratumMessageMiningSetTarget,
  StratumMessageMiningSubmit,
  StratumMessageMiningSubscribe,
  StratumMessageMiningSubscribed,
  StratumRequest,
  StratumResponse,
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
}

export class StratumServer {
  readonly server: net.Server
  readonly pool: MiningPool
  readonly logger: Logger

  // TODO: replace any
  clients: Map<number, StratumServerClient>
  // TODO: LRU?
  requestsSent: { [index: number]: unknown }
  nextMinerId: number
  nextMessageId: number

  currentWork: Buffer | null = null
  currentMiningRequestId: number | null = null

  constructor(options: { pool: MiningPool; logger?: Logger }) {
    this.pool = options.pool
    this.logger = options.logger ?? createRootLogger()

    this.clients = new Map()
    this.requestsSent = {}
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

  newWork(
    miningRequestId: number,
    block: SerializedBlockTemplate,
    currentHeadDifficulty: bigint,
    currentHeadTimestamp: number,
  ): void {
    this.currentMiningRequestId = miningRequestId
    this.currentWork = mineableHeaderString(block.header)

    this.logger.info(
      'Setting work for request:',
      this.currentMiningRequestId,
      `${this.currentWork.toString('hex').slice(0, 50)}...`,
    )

    this.broadcast(this.notifyMessage())
  }

  hasWork(): boolean {
    return this.currentWork != null
  }

  private onConnection(socket: net.Socket): void {
    const client = StratumServerClient.accept(socket, this.nextMinerId++)
    socket.on('data', (data: Buffer) => this.onData(client, data))
    socket.on('close', () => this.onDisconnect(client))

    this.logger.info(`Client ${client.id} connected:`, socket.remoteAddress)
    this.clients.set(client.id, client)
  }

  private onDisconnect(client: StratumServerClient): void {
    this.logger.info(`Client ${client.id} disconnected`)
    client.socket.removeAllListeners()
  }

  private onData(client: StratumServerClient, data: Buffer): void {
    const splitData = data.toString().trim().split('\n')

    for (const dataString of splitData) {
      const payload = JSON.parse(dataString) as StratumRequest

      // Request
      if (payload.method != null) {
        switch (payload.method) {
          case 'mining.subscribe': {
            this.logger.debug('mining.subscribe request received')

            const message = payload as StratumMessageMiningSubscribe
            const graffiti = Buffer.from(message.params, 'hex')

            client.graffiti = graffiti
            client.subscribed = true

            const response: Omit<StratumMessageMiningSubscribed, 'id'> = {
              result: client.id,
            }

            this.send(client, response)
            this.send(client, this.setTargetMessage())

            if (this.hasWork()) {
              this.send(client, this.notifyMessage())
            }

            break
          }

          case 'mining.submit': {
            this.logger.debug('mining.submit request received')
            const message = payload as StratumMessageMiningSubmit
            const submittedRequestId = message.params[0]
            const submittedRandomness = message.params[1]
            const submittedGraffiti = Buffer.from(message.params[2], 'hex')

            void this.pool.submitWork(
              client,
              submittedRequestId,
              submittedRandomness,
              submittedGraffiti,
            )

            break
          }

          default:
            this.logger.error('unexpected method', payload.method)
        }
      } else {
        // Response
        this.logger.info('response received')
      }
    }
  }

  // TODO: This and other messages can probably be notifications and not full json rpc requests
  // to minimize resource usage and noise
  private notifyMessage(): Omit<StratumMessageMiningNotify, 'id'> {
    Assert.isNotNull(this.currentMiningRequestId)
    Assert.isNotNull(this.currentWork)

    return {
      method: 'mining.notify',
      params: [this.currentMiningRequestId, this.currentWork?.toString('hex')],
    }
  }

  // TODO: This may change to targetDifficulty once time adjustment comes into play
  private setTargetMessage(): Omit<StratumMessageMiningSetTarget, 'id'> {
    return {
      method: 'mining.set_target',
      params: [this.pool.getTarget()],
    }
  }

  private broadcast(message: Omit<StratumMessage, 'id'>) {
    const withId: StratumMessage = {
      id: this.nextMessageId++,
      ...message,
    }

    const serialized = JSON.stringify(withId) + '\n'

    for (const client of this.clients.values()) {
      client.socket.write(serialized)
    }
  }

  private send(client: StratumServerClient, message: Omit<StratumMessage, 'id'>) {
    const withId: StratumMessage = {
      id: this.nextMessageId++,
      ...message,
    }

    const serialized = JSON.stringify(withId) + '\n'
    client.socket.write(serialized)
  }
}
