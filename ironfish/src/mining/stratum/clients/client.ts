/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Event } from '../../../event'
import { Logger } from '../../../logger'
import { MessageBuffer } from '../../../rpc'
import { ErrorUtils } from '../../../utils'
import { SetTimeoutToken } from '../../../utils/types'
import { YupUtils } from '../../../utils/yup'
import { DisconnectReason } from '../constants'
import { ServerMessageMalformedError } from '../errors'
import {
  MiningDisconnectMessageSchema,
  MiningGetStatusMessage,
  MiningNotifyMessage,
  MiningNotifySchema,
  MiningSetTargetMessage,
  MiningSetTargetSchema,
  MiningStatusMessage,
  MiningStatusSchema,
  MiningSubmitMessageV3,
  MiningSubmittedMessage,
  MiningSubmittedSchema,
  MiningSubscribedMessageSchemaV3,
  MiningSubscribedMessageV3,
  MiningSubscribeMessage,
  MiningWaitForWorkMessage,
  MiningWaitForWorkSchema,
  StratumMessage,
  StratumMessageSchema,
  StratumMessageWithError,
  StratumMessageWithErrorSchema,
} from '../messages'

export abstract class StratumClient {
  readonly logger: Logger
  readonly version: number

  private started: boolean
  private isClosing = false
  private id: number | null
  private connected: boolean
  private connectWarned: boolean
  private connectTimeout: SetTimeoutToken | null
  private nextMessageId: number
  private readonly messageBuffer = new MessageBuffer('\n')

  private disconnectReason: string | null = null
  private disconnectUntil: number | null = null
  private disconnectVersion: number | null = null
  private disconnectMessage: string | null = null

  readonly onConnected = new Event<[]>()
  readonly onSubscribed = new Event<[MiningSubscribedMessageV3]>()
  readonly onSubmitted = new Event<[MiningSubmittedMessage]>()
  readonly onSetTarget = new Event<[MiningSetTargetMessage]>()
  readonly onNotify = new Event<[MiningNotifyMessage]>()
  readonly onWaitForWork = new Event<[MiningWaitForWorkMessage]>()
  readonly onStatus = new Event<[MiningStatusMessage]>()
  readonly onStratumError = new Event<[StratumMessageWithError]>()

  constructor(options: { logger: Logger }) {
    this.logger = options.logger
    this.version = 3

    this.started = false
    this.id = null
    this.nextMessageId = 0
    this.connected = false
    this.connectWarned = false
    this.connectTimeout = null
  }

  protected abstract connect(): Promise<void>
  protected abstract writeData(data: string): void
  protected abstract close(): Promise<void>

  start(): void {
    if (this.started) {
      return
    }

    this.started = true
    this.logger.info('Connecting to pool...')
    void this.startConnecting()
  }

  private async startConnecting(): Promise<void> {
    if (this.isClosing) {
      return
    }

    if (this.disconnectUntil && this.disconnectUntil > Date.now()) {
      this.connectTimeout = setTimeout(() => void this.startConnecting(), 60 * 1000)
      return
    }

    const connected = await this.connect()
      .then(() => true)
      .catch(() => false)

    if (!this.started) {
      return
    }

    if (!connected) {
      if (!this.connectWarned) {
        this.logger.warn(`Failed to connect to pool, retrying...`)
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
    this.isClosing = true
    void this.close()

    if (this.connectTimeout) {
      clearTimeout(this.connectTimeout)
    }
  }

  subscribe(publicAddress: string, name?: string): void {
    this.send('mining.subscribe', {
      version: this.version,
      name,
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

  private send(method: 'mining.submit', body: MiningSubmitMessageV3): void
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

    this.writeData(JSON.stringify(message) + '\n')
  }

  protected onConnect(): void {
    this.connected = true

    this.logger.info('Successfully connected to pool')
  }

  protected onDisconnect = (): void => {
    this.connected = false
    this.messageBuffer.clear()

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
    } else if (!this.isClosing) {
      this.logger.info('Disconnected from pool unexpectedly. Reconnecting.')
    }

    if (!this.isClosing) {
      this.connectTimeout = setTimeout(() => void this.startConnecting(), 5000)
    }
  }

  protected onError = (error: unknown): void => {
    this.logger.error(`Stratum Error ${ErrorUtils.renderError(error)}`)
  }

  protected async onData(data: Buffer): Promise<void> {
    this.messageBuffer.write(data)

    for (const message of this.messageBuffer.readMessages()) {
      const payload: unknown = JSON.parse(message)

      const header = await YupUtils.tryValidate(StratumMessageSchema, payload)

      if (header.error) {
        // Try the stratum error message instead.
        const headerWithError = await YupUtils.tryValidate(
          StratumMessageWithErrorSchema,
          payload,
        )
        if (headerWithError.error) {
          throw new ServerMessageMalformedError(header.error)
        }
        this.logger.debug(
          `Server sent error ${headerWithError.result.error.message} for id ${headerWithError.result.error.id}`,
        )
        this.onStratumError.emit(headerWithError.result)
        return
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

          this.stop()
          break
        }

        case 'mining.subscribed': {
          const body = await YupUtils.tryValidate(
            MiningSubscribedMessageSchemaV3,
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

        case 'mining.submitted': {
          const body = await YupUtils.tryValidate(MiningSubmittedSchema, header.result.body)

          if (body.error) {
            throw new ServerMessageMalformedError(body.error, header.result.method)
          }
          this.onSubmitted.emit(body.result)
          break
        }

        default:
          throw new ServerMessageMalformedError(`Invalid message ${header.result.method}`)
      }
    }
  }
}
