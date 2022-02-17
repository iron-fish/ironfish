/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import net from 'net'
import { createRootLogger, Logger } from '../../logger'
import { SerializedBlockTemplate } from '../../serde/BlockTemplateSerde'
import { MiningPool } from '../miningPool'
import { mineableHeaderString } from '../utils'
import {
  StratumMessage,
  StratumMessageMiningSubmit,
  StratumMessageMiningSubscribe,
  StratumMessageMiningSubscribed,
  StratumRequest,
  StratumResponse,
} from './messages'

type StratumClient = {
  socket: net.Socket
  graffiti: Buffer
}

export class StratumServer {
  readonly server: net.Server
  readonly pool: MiningPool
  readonly logger: Logger

  // TODO: replace any
  connectedClients: Map<number, StratumClient>
  // TODO: LRU?
  requestsSent: { [index: number]: any }
  nextMinerId: number
  nextMessageId: number

  currentWork: Buffer | null = null
  currentMiningRequestId: number | null = null

  constructor(options: { pool: MiningPool; logger?: Logger }) {
    this.pool = options.pool
    this.logger = options.logger ?? createRootLogger()

    this.connectedClients = new Map()
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
    currentHeadDifficulty: string,
    currentHeadTimestamp: number,
  ): void {
    this.currentMiningRequestId = miningRequestId
    this.currentWork = mineableHeaderString(block.header)
    this.logger.info('setting current work', this.currentMiningRequestId, this.currentWork)

    this.broadcast(this.notifyMessage())
  }

  hasWork(): boolean {
    return this.currentWork != null
  }

  private onConnection(socket: net.Socket): void {
    this.logger.info('Client connection received')
    socket.on('data', (data: Buffer) => this.onData(socket, data))
    socket.on('close', () => this.onDisconnect(socket))
  }

  private onDisconnect(socket: net.Socket): void {
    this.logger.info('Client disconnect received')
    socket.removeAllListeners()
  }

  private onData(socket: net.Socket, data: Buffer): void {
    const splitData = data.toString().trim().split('\n')

    for (const dataString of splitData) {
      const payload = JSON.parse(dataString) as StratumRequest

      // Request
      if (payload.method != null) {
        switch (payload.method) {
          case 'mining.subscribe': {
            this.logger.info('mining.subscribe request received')

            const message = payload as StratumMessageMiningSubscribe
            const graffiti = Buffer.from(message.params, 'hex')

            const newMinerId = this.nextMinerId++

            this.connectedClients.set(newMinerId, {
              socket,
              graffiti,
            })

            const response: StratumMessageMiningSubscribed = {
              id: this.nextMessageId++,
              result: newMinerId,
            }

            this.send(socket, response)
            this.send(socket, this.setTargetMessage())

            if (this.hasWork()) {
              this.send(socket, this.notifyMessage())
            }

            break
          }

          case 'mining.submit': {
            this.logger.info('mining.submit request received')
            const message = payload as StratumMessageMiningSubmit
            const submittedRequestId = message.params[0]
            const submittedRandomness = message.params[1]
            const submittedGraffiti = message.params[2]

            this.pool.submitWork(submittedRequestId, submittedRandomness, submittedGraffiti)
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
  private notifyMessage(): StratumResponse {
    return {
      id: this.nextMessageId++,
      method: 'mining.notify',
      params: [this.currentMiningRequestId, this.currentWork?.toString('hex')],
    }
  }

  // TODO: This may change to targetDifficulty once time adjustment comes into play
  private setTargetMessage(): StratumMessage {
    return {
      id: this.nextMessageId++,
      method: 'mining.set_target',
      params: [this.pool.getTarget()],
    }
  }

  private broadcast(message: StratumMessage) {
    const msg = JSON.stringify(message) + '\n'

    for (const client of this.connectedClients.values()) {
      client.socket.write(msg)
    }
  }

  private send(socket: net.Socket, message: StratumMessage) {
    const msg = JSON.stringify(message) + '\n'
    socket.write(msg)
  }
}
