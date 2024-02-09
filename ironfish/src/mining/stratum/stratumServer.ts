/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import net from 'net'
import { Assert } from '../../assert'
import { Config } from '../../fileStores/config'
import { Logger } from '../../logger'
import { GRAFFITI_SIZE } from '../../primitives/block'
import { GraffitiUtils, StringUtils } from '../../utils'
import { ErrorUtils } from '../../utils/error'
import { YupUtils } from '../../utils/yup'
import { isValidPublicAddress } from '../../wallet/validator'
import { MiningPool } from '../pool'
import { IStratumAdapter } from './adapters'
import { DisconnectReason } from './constants'
import { ClientMessageMalformedError } from './errors'
import {
  MiningDisconnectMessage,
  MiningGetStatusSchema,
  MiningNotifyMessage,
  MiningSetTargetMessage,
  MiningStatusMessage,
  MiningSubmitSchemaV1,
  MiningSubmitSchemaV2,
  MiningSubmitSchemaV3,
  MiningSubmittedMessage,
  MiningSubscribedMessageV1,
  MiningSubscribedMessageV2,
  MiningSubscribeSchema,
  StratumMessage,
  StratumMessageSchema,
  StratumMessageWithError,
} from './messages'
import { StratumPeers } from './stratumPeers'
import { StratumServerClient } from './stratumServerClient'

export class StratumServer {
  readonly pool: MiningPool
  readonly config: Config
  readonly logger: Logger
  readonly peers: StratumPeers
  readonly adapters: IStratumAdapter[] = []

  clients: Map<number, StratumServerClient>
  nextMinerId: number
  nextMessageId: number
  subscribed: number

  currentWork: Buffer | null = null
  currentMiningRequestId: number | null = null
  readonly supportedVersions: number[]

  private _isRunning = false
  private _startPromise: Promise<unknown> | null = null

  constructor(options: {
    pool: MiningPool
    config: Config
    logger: Logger
    banning?: boolean
  }) {
    this.pool = options.pool
    this.config = options.config
    this.logger = options.logger

    this.supportedVersions = options.config.get('poolSupportedVersions')

    this.clients = new Map()
    this.nextMinerId = 1
    this.nextMessageId = 1
    this.subscribed = 0

    this.peers = new StratumPeers({
      config: this.config,
      server: this,
      banning: options.banning,
    })
  }

  get isRunning(): boolean {
    return this._isRunning
  }

  /** Starts the Stratum server and tells any attached adapters to start serving requests */
  async start(): Promise<void> {
    if (this._isRunning) {
      return
    }

    this.peers.start()

    this._startPromise = Promise.all(this.adapters.map((a) => a.start()))
    this._isRunning = true
    await this._startPromise
    this.logger.info(
      `Stratum server started with versions ${this.supportedVersions.join(', ')}`,
    )
  }

  /** Stops the Stratum server and tells any attached adapters to stop serving requests */
  async stop(): Promise<void> {
    if (!this._isRunning) {
      return
    }

    if (this._startPromise) {
      await this._startPromise
    }

    await Promise.all(this.adapters.map((a) => a.stop()))
    this._isRunning = false
  }

  /** Adds an adapter to the Stratum server and starts it if the server has already been started */
  mount(adapter: IStratumAdapter): void {
    this.adapters.push(adapter)
    adapter.attach(this)

    if (this._isRunning) {
      let promise: Promise<unknown> = adapter.start()

      if (this._startPromise) {
        // Attach this promise to the start promise chain
        // in case we call stop while were still starting up
        promise = Promise.all([this._startPromise, promise])
      }

      this._startPromise = promise
    }
  }

  newWork(miningRequestId: number, block: Buffer): void {
    this.currentMiningRequestId = miningRequestId
    this.currentWork = block

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

  onConnection(socket: net.Socket): void {
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

    if (client.subscription) {
      this.subscribed--
    }

    this.clients.delete(client.id)
    this.peers.removeConnectionCount(client)
    client.close()
    client.socket.removeAllListeners('close')
    client.socket.removeAllListeners('error')
  }

  private async onData(client: StratumServerClient, data: Buffer): Promise<void> {
    if (this.peers.isShadowBanned(client)) {
      return
    }

    client.messageBuffer.write(data)

    for (const split of client.messageBuffer.readMessages()) {
      const payload: unknown = JSON.parse(split)
      const { error: parseError, result: message } = await YupUtils.tryValidate(
        StratumMessageSchema,
        payload,
      )

      if (parseError) {
        this.peers.ban(client, {
          message: parseError.message,
        })
        return
      }

      this.logger.debug(`Client ${client.id} sent ${message.method} message`)

      if (message.method === 'mining.subscribe') {
        await this.handleMiningSubscribeMessage(client, message)
      } else if (message.method === 'mining.submit') {
        await this.handleMiningSubmitMessage(client, message)
      } else if (message.method === 'mining.get_status') {
        await this.handleMiningGetStatusMessage(client, message)
      } else {
        throw new ClientMessageMalformedError(client, `Invalid message ${message.method}`)
      }
    }
  }

  private async handleMiningSubscribeMessage(
    client: StratumServerClient,
    message: StratumMessage,
  ) {
    const body = await YupUtils.tryValidate(MiningSubscribeSchema, message.body)

    if (body.error) {
      this.peers.ban(client, {
        message: body.error.message,
      })
      return
    }

    if (!isValidPublicAddress(body.result.publicAddress)) {
      const msg = `Invalid public address: ${body.result.publicAddress}`
      this.sendStratumError(client, message.id, msg)
      this.peers.ban(client, {
        message: msg,
      })
      return
    }

    if (!this.supportedVersions.includes(body.result.version)) {
      const msg = `Client version ${body.result.version} is not handled by this server`
      this.sendStratumError(client, message.id, msg)
      this.peers.ban(client, {
        message: msg,
        reason: DisconnectReason.BAD_VERSION,
      })
      return
    }

    const idHex = client.id.toString(16)

    if (body.result.version === 1) {
      const graffiti = `${this.pool.name}.${idHex}`
      Assert.isTrue(StringUtils.getByteLength(graffiti) <= GRAFFITI_SIZE)

      client.subscription = {
        version: 1,
        publicAddress: body.result.publicAddress,
        graffiti: GraffitiUtils.fromString(graffiti),
        name: body.result.name,
        agent: body.result.agent,
      }

      this.send(client.socket, 'mining.subscribed', {
        clientId: client.id,
        graffiti: graffiti,
      })
    } else if (body.result.version === 2) {
      const xnHexSize = 2 * this.config.get('poolXnSize')
      const xn = idHex.slice(-xnHexSize).padStart(xnHexSize, '0')

      client.subscription = {
        version: 2,
        publicAddress: body.result.publicAddress,
        xn,
        name: body.result.name,
        agent: body.result.agent,
      }

      this.send(client.socket, 'mining.subscribed', {
        clientId: client.id,
        xn,
      })
    } else if (body.result.version === 3) {
      const xnHexSize = 2 * this.config.get('poolXnSize')
      const xn = idHex.slice(-xnHexSize).padStart(xnHexSize, '0')

      client.subscription = {
        version: 3,
        publicAddress: body.result.publicAddress,
        xn,
        name: body.result.name,
        agent: body.result.agent,
      }

      this.send(client.socket, 'mining.subscribed', {
        clientId: client.id,
        xn,
      })
    }

    this.subscribed++

    this.logger.info(`Miner ${idHex} connected (${this.subscribed} total)`)

    this.send(client.socket, 'mining.set_target', this.getSetTargetMessage())

    if (this.hasWork()) {
      this.send(client.socket, 'mining.notify', this.getNotifyMessage())
    }
  }

  private async handleMiningSubmitMessage(
    client: StratumServerClient,
    message: StratumMessage,
  ) {
    if (client.subscription?.version === 1) {
      const body = await YupUtils.tryValidate(MiningSubmitSchemaV1, message.body)

      if (body.error) {
        this.peers.ban(client, {
          message: body.error.message,
        })
        return
      }

      const { miningRequestId, randomness } = body.result

      await this.pool.submitWork(
        client,
        miningRequestId,
        randomness,
        client.subscription.graffiti.toString('hex'),
      )
    } else if (client.subscription?.version === 2) {
      const body = await YupUtils.tryValidate(MiningSubmitSchemaV2, message.body)

      if (body.error) {
        this.peers.ban(client, {
          message: body.error.message,
        })
        return
      }

      const { randomness, graffiti, miningRequestId } = body.result

      if (!randomness.startsWith(client.subscription.xn)) {
        this.send(client.socket, 'mining.submitted', {
          id: message.id,
          result: false,
          message: 'invalid leading xnonce in randomness',
        })
        return
      }

      const { error } = await this.pool.submitWork(
        client,
        miningRequestId,
        randomness,
        graffiti,
      )

      if (error) {
        this.send(client.socket, 'mining.submitted', {
          id: message.id,
          result: false,
          message: error,
        })
      } else {
        this.send(client.socket, 'mining.submitted', {
          id: message.id,
          result: true,
        })
      }
    } else if (client.subscription?.version === 3) {
      const body = await YupUtils.tryValidate(MiningSubmitSchemaV3, message.body)

      if (body.error) {
        this.peers.ban(client, {
          message: body.error.message,
        })
        return
      }

      const { randomness, miningRequestId } = body.result

      if (!randomness.startsWith(client.subscription.xn)) {
        this.send(client.socket, 'mining.submitted', {
          id: message.id,
          result: false,
          message: 'invalid leading xnonce in randomness',
        })
        return
      }

      const { error } = await this.pool.submitWork(
        client,
        miningRequestId,
        randomness,
        GraffitiUtils.fromString(`${this.pool.name}`).toString('hex'),
      )

      if (error) {
        this.send(client.socket, 'mining.submitted', {
          id: message.id,
          result: false,
          message: error,
        })
      } else {
        this.send(client.socket, 'mining.submitted', {
          id: message.id,
          result: true,
        })
      }
    } else {
      this.peers.ban(client, { message: 'Client was not subscribed' })
      return
    }
  }

  private async handleMiningGetStatusMessage(
    client: StratumServerClient,
    message: StratumMessage,
  ) {
    const body = await YupUtils.tryValidate(MiningGetStatusSchema, message.body)

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

    if (client.subscription) {
      this.subscribed--
    }

    this.clients.delete(client.id)
    this.peers.removeConnectionCount(client)
  }

  getNotifyMessage(): MiningNotifyMessage {
    Assert.isNotNull(this.currentMiningRequestId)
    Assert.isNotNull(this.currentWork)

    return {
      miningRequestId: this.currentMiningRequestId,
      header: this.currentWork?.toString('hex'),
    }
  }

  getSetTargetMessage(): MiningSetTargetMessage {
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
      if (!client.subscription) {
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
  send(socket: net.Socket, method: 'mining.subscribed', body: MiningSubscribedMessageV1): void
  send(socket: net.Socket, method: 'mining.subscribed', body: MiningSubscribedMessageV2): void
  send(socket: net.Socket, method: 'mining.submitted', body: MiningSubmittedMessage): void
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

  sendStratumError(client: StratumServerClient, id: number, message: string): void {
    const msg: StratumMessageWithError = {
      id: this.nextMessageId++,
      error: {
        id: id,
        message: message,
      },
    }
    const serialized = JSON.stringify(msg) + '\n'
    client.socket.write(serialized)
  }
}
