/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import net from 'net'
import { isValidPublicAddress } from '../../account/validator'
import { Assert } from '../../assert'
import { GRAFFITI_SIZE } from '../../consensus/consensus'
import { Config } from '../../fileStores/config'
import { Logger } from '../../logger'
import { SerializedBlockTemplate } from '../../serde/BlockTemplateSerde'
import { GraffitiUtils, StringUtils } from '../../utils'
import { ErrorUtils } from '../../utils/error'
import { YupUtils } from '../../utils/yup'
import { MiningPool } from '../pool'
import { mineableHeaderString } from '../utils'
import { DisconnectReason } from './constants'
import { ClientMessageMalformedError } from './errors'
import {
  MiningDisconnectMessage,
  MiningGetStatusSchema,
  MiningNotifyMessage,
  MiningSetTargetMessage,
  MiningStatusMessage,
  MiningSubmitSchema,
  MiningSubscribedMessage,
  MiningSubscribeSchema,
  StratumMessage,
  StratumMessageSchema,
} from './messages'
import { StratumPeers } from './stratumPeers'
import { StratumServerClient } from './stratumServerClient'
import { STRATUM_VERSION_PROTOCOL, STRATUM_VERSION_PROTOCOL_MIN } from './version'

const FIVE_MINUTES_MS = 5 * 60 * 1000

export class StratumServer {
  readonly server: net.Server
  readonly pool: MiningPool
  readonly config: Config
  readonly logger: Logger
  readonly peers: StratumPeers

  readonly port: number
  readonly host: string

  clients: Map<number, StratumServerClient>
  nextMinerId: number
  nextMessageId: number
  subscribed: number

  currentWork: Buffer | null = null
  currentMiningRequestId: number | null = null
  readonly version: number
  readonly versionMin: number

  constructor(options: {
    pool: MiningPool
    config: Config
    logger: Logger
    port?: number
    host?: string
    banning?: boolean
  }) {
    this.pool = options.pool
    this.config = options.config
    this.logger = options.logger

    this.version = STRATUM_VERSION_PROTOCOL
    this.versionMin = STRATUM_VERSION_PROTOCOL_MIN

    this.host = options.host ?? this.config.get('poolHost')
    this.port = options.port ?? this.config.get('poolPort')

    this.clients = new Map()
    this.nextMinerId = 1
    this.nextMessageId = 1
    this.subscribed = 0

    this.peers = new StratumPeers({
      config: this.config,
      server: this,
      banning: options.banning,
    })

    this.server = net.createServer((s) => this.onConnection(s))
  }

  start(): void {
    this.peers.start()
    this.server.listen(this.port, this.host)
  }

  stop(): void {
    this.peers.stop()
    this.server.close()
  }

  newWork(miningRequestId: number, block: SerializedBlockTemplate): void {
    this.currentMiningRequestId = miningRequestId
    this.currentWork = mineableHeaderString(block.header)

    this.logger.info(
      `Setting work for request: ${this.currentMiningRequestId} ${this.currentWork
        .toString('hex')
        .slice(0, 50)}...`,
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
    if (!this.peers.isAllowed(socket)) {
      if (this.peers.isBanned(socket)) {
        this.peers.sendBanMessage(socket)
      }

      socket.destroy()
      return
    }

    const client = StratumServerClient.accept(socket, this.nextMinerId++)

    this.peers.addConnectionCount(client)

    socket.on('data', (data: Buffer) => {
      this.onData(client, data).catch((e) => this.onError(client, e))
    })

    socket.on('close', () => this.onDisconnect(client))
    socket.on('error', (e) => this.onError(client, e))

    this.logger.debug(`Client ${client.id} connected: ${client.remoteAddress}`)
    this.clients.set(client.id, client)
  }

  private onDisconnect(client: StratumServerClient): void {
    this.logger.debug(`Client ${client.id} disconnected  (${this.clients.size - 1} total)`)

    if (client.subscribed) {
      this.subscribed--
    }

    this.clients.delete(client.id)
    this.peers.removeConnectionCount(client)
    client.close()
  }

  private async onData(client: StratumServerClient, data: Buffer): Promise<void> {
    if (this.peers.isShadowBanned(client)) {
      return
    }

    client.messageBuffer += data.toString('utf-8')
    const lastDelimiterIndex = client.messageBuffer.lastIndexOf('\n')
    const splits = client.messageBuffer.substring(0, lastDelimiterIndex).trim().split('\n')
    client.messageBuffer = client.messageBuffer.substring(lastDelimiterIndex + 1)

    for (const split of splits) {
      const payload: unknown = JSON.parse(split)

      const header = await YupUtils.tryValidate(StratumMessageSchema, payload)

      if (header.error) {
        this.peers.ban(client, {
          message: header.error.message,
        })
        return
      }

      this.logger.debug(`Client ${client.id} sent ${header.result.method} message`)

      switch (header.result.method) {
        case 'mining.subscribe': {
          const body = await YupUtils.tryValidate(MiningSubscribeSchema, header.result.body)

          if (body.error) {
            this.peers.ban(client, {
              message: body.error.message,
            })
            return
          }

          if (body.result.version < this.versionMin) {
            this.peers.ban(client, {
              message: `Client version ${body.result.version} does not meet minimum version ${this.versionMin}`,
              reason: DisconnectReason.BAD_VERSION,
              until: Date.now() + FIVE_MINUTES_MS,
              versionExpected: this.version,
            })
            return
          }

          if (!isValidPublicAddress(body.result.publicAddress)) {
            this.peers.ban(client, {
              message: `Invalid public address: ${body.result.publicAddress}`,
            })
            return
          }

          client.publicAddress = body.result.publicAddress
          client.name = body.result.name
          client.subscribed = true
          this.subscribed++

          const idHex = client.id.toString(16)
          const graffiti = `${this.pool.name}.${idHex}`
          Assert.isTrue(StringUtils.getByteLength(graffiti) <= GRAFFITI_SIZE)
          client.graffiti = GraffitiUtils.fromString(graffiti)

          this.logger.info(`Miner ${idHex} connected (${this.subscribed} total)`)

          this.send(client.socket, 'mining.subscribed', {
            clientId: client.id,
            graffiti: graffiti,
          })

          this.send(client.socket, 'mining.set_target', this.getSetTargetMessage())

          if (this.hasWork()) {
            this.send(client.socket, 'mining.notify', this.getNotifyMessage())
          }

          break
        }

        case 'mining.submit': {
          const body = await YupUtils.tryValidate(MiningSubmitSchema, header.result.body)

          if (body.error) {
            this.peers.ban(client, {
              message: body.error.message,
            })
            return
          }

          const submittedRequestId = body.result.miningRequestId
          const submittedRandomness = body.result.randomness

          void this.pool.submitWork(client, submittedRequestId, submittedRandomness)
          break
        }

        case 'mining.get_status': {
          const body = await YupUtils.tryValidate(MiningGetStatusSchema, header.result.body)

          if (body.error) {
            this.peers.ban(client, {
              message: body.error.message,
            })
            return
          }

          const publicAddress = body.result?.publicAddress

          if (publicAddress && !isValidPublicAddress(publicAddress)) {
            this.peers.ban(client, {
              message: `Invalid public address: ${publicAddress}`,
            })
            return
          }

          this.send(client.socket, 'mining.status', await this.pool.getStatus(publicAddress))
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
    this.logger.debug(
      `Error during handling of data from client ${client.id}: ${ErrorUtils.renderError(
        error,
        true,
      )}`,
    )

    client.socket.removeAllListeners()
    client.close()
    this.clients.delete(client.id)
    this.peers.removeConnectionCount(client)
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

    this.logger.debug('broadcasting to clients', {
      method,
      id: message.id,
      numClients: this.clients.size,
      messageLength: serialized.length,
    })

    let broadcasted = 0

    for (const client of this.clients.values()) {
      if (!client.subscribed) {
        continue
      }

      if (!client.connected) {
        continue
      }

      if (this.peers.isShadowBanned(client)) {
        continue
      }

      client.socket.write(serialized)
      broadcasted++
    }

    this.logger.debug('completed broadcast to clients', {
      method,
      id: message.id,
      numClients: broadcasted,
      messageLength: serialized.length,
    })
  }
  send(socket: net.Socket, method: 'mining.notify', body: MiningNotifyMessage): void
  send(socket: net.Socket, method: 'mining.disconnect', body: MiningDisconnectMessage): void
  send(socket: net.Socket, method: 'mining.set_target', body: MiningSetTargetMessage): void
  send(socket: net.Socket, method: 'mining.subscribed', body: MiningSubscribedMessage): void
  send(socket: net.Socket, method: 'mining.wait_for_work'): void
  send(socket: net.Socket, method: 'mining.status', body: MiningStatusMessage): void
  send(socket: net.Socket, method: string, body?: unknown): void {
    const message: StratumMessage = {
      id: this.nextMessageId++,
      method: method,
      body: body,
    }

    const serialized = JSON.stringify(message) + '\n'
    socket.write(serialized)
  }
}
