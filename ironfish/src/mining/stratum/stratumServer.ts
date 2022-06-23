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
import { StratumServerClient } from './stratumServerClient'
import { STRATUM_VERSION_PROTOCOL_MIN } from './version'

export class StratumServer {
  readonly server: net.Server
  readonly pool: MiningPool
  readonly config: Config
  readonly logger: Logger

  readonly port: number
  readonly host: string

  readonly maxConnectionsByIp: number

  clients: Map<number, StratumServerClient>
  badClients: Set<number>
  connectionsByIp: Map<string, number>
  nextMinerId: number
  nextMessageId: number

  currentWork: Buffer | null = null
  currentMiningRequestId: number | null = null

  constructor(options: {
    pool: MiningPool
    config: Config
    logger: Logger
    port?: number
    host?: string
  }) {
    this.pool = options.pool
    this.config = options.config
    this.logger = options.logger

    this.host = options.host ?? this.config.get('poolHost')
    this.port = options.port ?? this.config.get('poolPort')
    this.maxConnectionsByIp = this.config.get('poolMaxConnectionsPerIp')

    this.clients = new Map()
    this.badClients = new Set()
    this.nextMinerId = 1
    this.nextMessageId = 1
    this.connectionsByIp = new Map()

    this.server = net.createServer((s) => this.onConnection(s))
  }

  start(): void {
    this.server.listen(this.port, this.host)
  }

  stop(): void {
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

  addBadClient(client: StratumServerClient): void {
    this.badClients.add(client.id)
    this.send(client, 'mining.wait_for_work')
  }

  private onConnection(socket: net.Socket): void {
    if (!this.isSocketAllowed(socket)) {
      socket.destroy()
      return
    }

    const client = StratumServerClient.accept(socket, this.nextMinerId++)

    this.addConnectionCount(client)

    socket.on('data', (data: Buffer) => {
      this.onData(client, data).catch((e) => this.onError(client, e))
    })

    socket.on('close', () => this.onDisconnect(client))
    socket.on('error', (e) => this.onError(client, e))

    this.logger.debug(`Client ${client.id} connected: ${client.remoteAddress}`)
    this.clients.set(client.id, client)
  }

  // Returns the count of connected clients excluding those marked as bad clients
  getClientCount(): number {
    let count = 0
    for (const client of this.clients.keys()) {
      if (this.badClients.has(client)) {
        continue
      }
      count += 1
    }
    return count
  }

  private onDisconnect(client: StratumServerClient): void {
    this.logger.debug(`Client ${client.id} disconnected  (${this.clients.size - 1} total)`)

    this.clients.delete(client.id)
    this.removeConnectionCount(client)
    client.close()
  }

  private async onData(client: StratumServerClient, data: Buffer): Promise<void> {
    if (this.badClients.has(client.id)) {
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
        throw new ClientMessageMalformedError(client, header.error)
      }

      this.logger.debug(`Client ${client.id} sent ${header.result.method} message`)

      switch (header.result.method) {
        case 'mining.subscribe': {
          const body = await YupUtils.tryValidate(MiningSubscribeSchema, header.result.body)

          if (body.error) {
            this.addBadClient(client)
            continue
            // throw new ClientMessageMalformedError(client, body.error, header.result.method)
          }

          // TODO: This undefined check makes version optional, we should require it by
          // removing this undefined check in a future update once we have given enough
          // notice after this deploy.
          if (
            body.result.version !== undefined &&
            body.result.version < STRATUM_VERSION_PROTOCOL_MIN
          ) {
            this.addBadClient(client)
            continue
            // throw new ClientMessageMalformedError(
            //   client,
            //   `Client version ${body.result.version} does not meet minimum version ${STRATUM_VERSION_PROTOCOL_MIN}`,
            //   header.result.method,
            // )
          }

          client.publicAddress = body.result.publicAddress
          client.subscribed = true

          if (!isValidPublicAddress(client.publicAddress)) {
            throw new ClientMessageMalformedError(
              client,
              `Invalid public address: ${client.publicAddress}`,
              header.result.method,
            )
          }

          const idHex = client.id.toString(16)
          const graffiti = `${this.pool.name}.${idHex}`
          Assert.isTrue(StringUtils.getByteLength(graffiti) <= GRAFFITI_SIZE)
          client.graffiti = GraffitiUtils.fromString(graffiti)

          this.logger.info(`Miner ${idHex} connected (${this.clients.size} total)`)

          this.send(client, 'mining.subscribed', { clientId: client.id, graffiti: graffiti })
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

          void this.pool.submitWork(client, submittedRequestId, submittedRandomness)

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
    this.removeConnectionCount(client)
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

    for (const client of this.clients.values()) {
      if (this.badClients.has(client.id)) {
        continue
      }

      if (!client.connected) {
        continue
      }

      client.socket.write(serialized)
    }
    this.logger.debug('completed broadcast to clients', {
      method,
      id: message.id,
      numClients: this.clients.size,
      messageLength: serialized.length,
    })
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
  private send(client: StratumServerClient, method: 'mining.wait_for_work'): void
  private send(client: StratumServerClient, method: string, body?: unknown): void {
    const message: StratumMessage = {
      id: this.nextMessageId++,
      method: method,
      body: body,
    }

    const serialized = JSON.stringify(message) + '\n'
    client.socket.write(serialized)
  }

  protected addConnectionCount(client: StratumServerClient): void {
    const count = this.connectionsByIp.get(client.remoteAddress) ?? 0
    this.connectionsByIp.set(client.remoteAddress, count + 1)
  }

  protected removeConnectionCount(client: StratumServerClient): void {
    const count = this.connectionsByIp.get(client.remoteAddress) ?? 0
    this.connectionsByIp.set(client.remoteAddress, count - 1)

    if (count - 1 <= 0) {
      this.connectionsByIp.delete(client.remoteAddress)
    }
  }

  protected isSocketAllowed(socket: net.Socket): boolean {
    if (!socket.remoteAddress) {
      return false
    }

    const connections = this.connectionsByIp.get(socket.remoteAddress) ?? 0
    if (this.maxConnectionsByIp > 0 && connections >= this.maxConnectionsByIp) {
      return false
    }

    return true
  }
}
