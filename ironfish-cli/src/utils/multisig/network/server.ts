/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ErrorUtils, Logger, YupUtils } from '@ironfish/sdk'
import net from 'net'
import { IStratumAdapter } from './adapters'
import { ClientMessageMalformedError } from './errors'
import {
  DkgStatusMessage,
  IdentityMessage,
  IdentitySchema,
  Round1PublicPackageMessage,
  Round1PublicPackageSchema,
  Round2PublicPackageMessage,
  Round2PublicPackageSchema,
  StratumMessage,
  StratumMessageSchema,
  StratumMessageWithError,
} from './messages'
import { MultisigServerClient } from './serverClient'

export type DkgStatus = {
  minSigners: number
  maxSigners: number
  identities: string[]
  round1PublicPackages: string[]
  round2PublicPackages: string[]
}

export class MultisigServer {
  readonly logger: Logger
  readonly adapters: IStratumAdapter[] = []

  clients: Map<number, MultisigServerClient>
  nextClientId: number
  nextMessageId: number

  status: DkgStatus

  private _isRunning = false
  private _startPromise: Promise<unknown> | null = null

  constructor(status: DkgStatus, options: { logger: Logger; banning?: boolean }) {
    this.status = status

    this.logger = options.logger

    this.clients = new Map()
    this.nextClientId = 1
    this.nextMessageId = 1
  }

  get isRunning(): boolean {
    return this._isRunning
  }

  /** Starts the Stratum server and tells any attached adapters to start serving requests */
  async start(): Promise<void> {
    if (this._isRunning) {
      return
    }

    this._startPromise = Promise.all(this.adapters.map((a) => a.start()))
    this._isRunning = true
    await this._startPromise
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

  onConnection(socket: net.Socket): void {
    const client = MultisigServerClient.accept(socket, this.nextClientId++)

    socket.on('data', (data: Buffer) => {
      this.onData(client, data).catch((e) => this.onError(client, e))
    })

    socket.on('close', () => this.onDisconnect(client))
    socket.on('error', (e) => this.onError(client, e))

    this.logger.debug(`Client ${client.id} connected: ${client.remoteAddress}`)
    this.clients.set(client.id, client)

    this.send(client.socket, 'dkg.status', this.status)
  }

  private onDisconnect(client: MultisigServerClient): void {
    this.logger.debug(`Client ${client.id} disconnected  (${this.clients.size - 1} total)`)

    this.clients.delete(client.id)
    client.close()
    client.socket.removeAllListeners('close')
    client.socket.removeAllListeners('error')
  }

  private async onData(client: MultisigServerClient, data: Buffer): Promise<void> {
    client.messageBuffer.write(data)

    for (const split of client.messageBuffer.readMessages()) {
      const payload: unknown = JSON.parse(split)
      const { error: parseError, result: message } = await YupUtils.tryValidate(
        StratumMessageSchema,
        payload,
      )

      if (parseError) {
        return
      }

      this.logger.debug(`Client ${client.id} sent ${message.method} message`)

      if (message.method === 'identity') {
        await this.handleIdentityMessage(message)
        return
      } else if (message.method === 'dkg.round1') {
        await this.handleRound1PublicPackageMessage(message)
        return
      } else if (message.method === 'dkg.round2') {
        await this.handleRound2PublicPackageMessage(message)
        return
      } else if (message.method === 'dkg.get_status') {
        this.send(client.socket, 'dkg.status', this.status)
      } else {
        throw new ClientMessageMalformedError(client, `Invalid message ${message.method}`)
      }
    }
  }

  private onError(client: MultisigServerClient, error: unknown): void {
    this.logger.debug(
      `Error during handling of data from client ${client.id}: ${ErrorUtils.renderError(
        error,
        true,
      )}`,
    )

    client.socket.removeAllListeners()
    client.close()

    this.clients.delete(client.id)
  }

  private broadcast(method: 'identity', body: IdentityMessage): void
  private broadcast(method: 'dkg.round1', body: Round1PublicPackageMessage): void
  private broadcast(method: 'dkg.round2', body: Round2PublicPackageMessage): void
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
      if (!client.connected) {
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

  send(socket: net.Socket, method: 'dkg.status', body: DkgStatusMessage): void
  send(socket: net.Socket, method: string, body?: unknown): void {
    const message: StratumMessage = {
      id: this.nextMessageId++,
      method: method,
      body: body,
    }

    const serialized = JSON.stringify(message) + '\n'
    socket.write(serialized)
  }

  sendStratumError(client: MultisigServerClient, id: number, message: string): void {
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

  async handleIdentityMessage(message: StratumMessage) {
    const body = await YupUtils.tryValidate(IdentitySchema, message.body)

    if (body.error) {
      return
    }

    const identity = body.result.identity
    if (!this.status.identities.includes(identity)) {
      this.status.identities.push(identity)
      this.broadcast('identity', { identity })
    }
  }

  async handleRound1PublicPackageMessage(message: StratumMessage) {
    const body = await YupUtils.tryValidate(Round1PublicPackageSchema, message.body)

    if (body.error) {
      return
    }

    const round1PublicPackage = body.result.package
    if (!this.status.round1PublicPackages.includes(round1PublicPackage)) {
      this.status.round1PublicPackages.push(round1PublicPackage)
      this.broadcast('dkg.round1', { package: round1PublicPackage })
    }
  }

  async handleRound2PublicPackageMessage(message: StratumMessage) {
    const body = await YupUtils.tryValidate(Round2PublicPackageSchema, message.body)

    if (body.error) {
      return
    }

    const round2PublicPackage = body.result.package
    if (!this.status.round2PublicPackages.includes(round2PublicPackage)) {
      this.status.round2PublicPackages.push(round2PublicPackage)
      this.broadcast('dkg.round2', { package: round2PublicPackage })
    }
  }
}
