/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import net from 'net'
import { Event } from '../../event'
import { Logger } from '../../logger'
import { ErrorUtils } from '../../utils'
import { SetTimeoutToken } from '../../utils/types'
import { YupUtils } from '../../utils/yup'
import { DisconnectReason } from './constants'
import { ServerMessageMalformedError } from './errors'
import {
  MiningDisconnectMessageSchema,
  MiningGetStatusMessage,
  MiningNotifyMessage,
  MiningNotifySchema,
  MiningSetTargetMessage,
  MiningSetTargetSchema,
  MiningStatusMessage,
  MiningStatusSchema,
  MiningSubmitMessage,
  MiningSubscribedMessage,
  MiningSubscribedMessageSchema,
  MiningSubscribeMessage,
  MiningWaitForWorkMessage,
  MiningWaitForWorkSchema,
  StratumMessage,
  StratumMessageSchema,
} from './messages'
import { STRATUM_VERSION_PROTOCOL } from './version'

export class StratumClient {
  readonly socket: net.Socket
  readonly host: string
  readonly port: number
  readonly logger: Logger
  readonly version: number

  private started: boolean
  private id: number | null
  private connected: boolean
  private connectWarned: boolean
  private connectTimeout: SetTimeoutToken | null
  private nextMessageId: number
  private messageBuffer = ''

  private disconnectReason: string | null = null
  private disconnectUntil: number | null = null
  private disconnectVersion: number | null = null
  private disconnectMessage: string | null = null

  readonly onConnected = new Event<[]>()
  readonly onSubscribed = new Event<[MiningSubscribedMessage]>()
  readonly onSetTarget = new Event<[MiningSetTargetMessage]>()
  readonly onNotify = new Event<[MiningNotifyMessage]>()
  readonly onWaitForWork = new Event<[MiningWaitForWorkMessage]>()
  readonly onStatus = new Event<[MiningStatusMessage]>()

  constructor(options: { host: string; port: number; logger: Logger }) {
    this.host = options.host
    this.port = options.port
    this.logger = options.logger
    this.version = STRATUM_VERSION_PROTOCOL

    this.started = false
    this.id = null
    this.nextMessageId = 0
    this.connected = false
    this.connectWarned = false
    this.connectTimeout = null

    this.socket = new net.Socket()
    this.socket.on('data', (data) => void this.onData(data).catch((e) => this.onError(e)))
  }

  start(): void {
    if (this.started) {
      return
    }

    this.started = true
    this.logger.info('Connecting to pool...')
    void this.startConnecting()
  }

  private async startConnecting(): Promise<void> {
    if (this.disconnectUntil && this.disconnectUntil > Date.now()) {
      this.connectTimeout = setTimeout(() => void this.startConnecting(), 60 * 1000)
      return
    }

    const connected = await connectSocket(this.socket, this.host, this.port)
      .then(() => true)
      .catch(() => false)

    if (!this.started) {
      return
    }

    if (!connected) {
      if (!this.connectWarned) {
        this.logger.warn(`Failed to connect to pool at ${this.host}:${this.port}, retrying...`)
        this.connectWarned = true
      }

      this.connectTimeout = setTimeout(() => void this.startConnecting(), 5000)
      return
    }

    this.connectWarned = false
    this.onConnect()
    this.onConnected.emit()
  }

  stop(): void {
    this.socket.end()

    if (this.connectTimeout) {
      clearTimeout(this.connectTimeout)
    }
  }

  subscribe(publicAddress: string): void {
    this.send('mining.subscribe', {
      version: this.version,
      publicAddress: publicAddress,
    })

    this.logger.info('Subscribing to pool to receive work')
  }

  submit(miningRequestId: number, randomness: string): void {
    this.send('mining.submit', {
      miningRequestId: miningRequestId,
      randomness: randomness,
    })
  }

  getStatus(publicAddress?: string): void {
    this.send('mining.get_status', { publicAddress: publicAddress })
  }

  isConnected(): boolean {
    return this.connected
  }

  private send(method: 'mining.submit', body: MiningSubmitMessage): void
  private send(method: 'mining.subscribe', body: MiningSubscribeMessage): void
  private send(method: 'mining.get_status', body: MiningGetStatusMessage): void
  private send(method: string, body?: unknown): void {
    if (!this.connected) {
      return
    }

    const message: StratumMessage = {
      id: this.nextMessageId++,
      method: method,
      body: body,
    }

    this.socket.write(JSON.stringify(message) + '\n')
  }

  private onConnect(): void {
    this.connected = true
    this.socket.on('error', this.onError)
    this.socket.on('close', this.onDisconnect)

    this.logger.info('Successfully connected to pool')
  }

  private onDisconnect = (): void => {
    this.connected = false
    this.messageBuffer = ''
    this.socket.off('error', this.onError)
    this.socket.off('close', this.onDisconnect)

    this.onWaitForWork.emit(undefined)

    if (this.disconnectReason === DisconnectReason.BAD_VERSION) {
      this.logger.info(
        `Disconnected: You are running stratum version ${
          this.version
        } and the pool is running version ${String(this.disconnectVersion)}.`,
      )
    } else if (this.disconnectUntil) {
      let message = `Disconnected: You have been banned from the pool until ${new Date(
        this.disconnectUntil,
      ).toUTCString()}`

      if (this.disconnectMessage) {
        message += ': ' + this.disconnectMessage
      }

      this.logger.info(message)
    } else {
      this.logger.info('Disconnected from pool unexpectedly. Reconnecting.')
    }

    this.connectTimeout = setTimeout(() => void this.startConnecting(), 5000)
  }

  private onError = (error: unknown): void => {
    this.logger.error(`Stratum Error ${ErrorUtils.renderError(error)}`)
  }

  private async onData(data: Buffer): Promise<void> {
    this.messageBuffer += data.toString('utf-8')
    const lastDelimiterIndex = this.messageBuffer.lastIndexOf('\n')
    const splits = this.messageBuffer.substring(0, lastDelimiterIndex).trim().split('\n')
    this.messageBuffer = this.messageBuffer.substring(lastDelimiterIndex + 1)

    for (const split of splits) {
      const payload: unknown = JSON.parse(split)

      const header = await YupUtils.tryValidate(StratumMessageSchema, payload)

      if (header.error) {
        throw new ServerMessageMalformedError(header.error)
      }

      this.logger.debug(`Server sent ${header.result.method} message`)

      switch (header.result.method) {
        case 'mining.disconnect': {
          const body = await YupUtils.tryValidate(
            MiningDisconnectMessageSchema,
            header.result.body,
          )

          this.disconnectReason = body.result?.reason ?? null
          this.disconnectVersion = body.result?.versionExpected ?? null
          this.disconnectUntil = body.result?.bannedUntil ?? null
          this.disconnectMessage = body.result?.message ?? null

          this.socket.destroy()
          break
        }

        case 'mining.subscribed': {
          const body = await YupUtils.tryValidate(
            MiningSubscribedMessageSchema,
            header.result.body,
          )

          if (body.error) {
            throw new ServerMessageMalformedError(body.error, header.result.method)
          }

          this.id = body.result.clientId
          this.logger.debug(`Server has identified us as client ${this.id}`)
          this.onSubscribed.emit(body.result)
          break
        }

        case 'mining.set_target': {
          const body = await YupUtils.tryValidate(MiningSetTargetSchema, header.result.body)

          if (body.error) {
            throw new ServerMessageMalformedError(body.error, header.result.method)
          }
          this.onSetTarget.emit(body.result)
          break
        }

        case 'mining.notify': {
          const body = await YupUtils.tryValidate(MiningNotifySchema, header.result.body)

          if (body.error) {
            throw new ServerMessageMalformedError(body.error, header.result.method)
          }
          this.onNotify.emit(body.result)
          break
        }

        case 'mining.wait_for_work': {
          const body = await YupUtils.tryValidate(MiningWaitForWorkSchema, header.result.body)

          if (body.error) {
            throw new ServerMessageMalformedError(body.error, header.result.method)
          }
          this.onWaitForWork.emit(body.result)
          break
        }

        case 'mining.status': {
          const body = await YupUtils.tryValidate(MiningStatusSchema, header.result.body)

          if (body.error) {
            throw new ServerMessageMalformedError(body.error, header.result.method)
          }
          this.onStatus.emit(body.result)
          break
        }

        default:
          throw new ServerMessageMalformedError(`Invalid message ${header.result.method}`)
      }
    }
  }
}

// Transform net.Socket.connect() callback into a nicer promise style interface
function connectSocket(socket: net.Socket, host: string, port: number): Promise<void> {
  return new Promise((resolve, reject): void => {
    const onConnect = () => {
      socket.off('connect', onConnect)
      socket.off('error', onError)
      resolve()
    }

    const onError = (error: unknown) => {
      socket.off('connect', onConnect)
      socket.off('error', onError)
      reject(error)
    }

    socket.on('error', onError)
    socket.on('connect', onConnect)
    socket.connect(port, host)
  })
}
