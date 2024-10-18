/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { xchacha20poly1305 } from '@ironfish/rust-nodejs'
import {
  ErrorUtils,
  Event,
  Logger,
  MessageBuffer,
  SetTimeoutToken,
  YupUtils,
} from '@ironfish/sdk'
import { v4 as uuid } from 'uuid'
import {
  MultisigClientError,
  ServerMessageMalformedError,
  SessionDecryptionError,
} from '../errors'
import {
  ConnectedMessage,
  ConnectedMessageSchema,
  DkgGetStatusMessage,
  DkgStartSessionMessage,
  DkgStatusMessage,
  DkgStatusSchema,
  JoinedSessionMessage,
  JoinedSessionSchema,
  JoinSessionMessage,
  MultisigBrokerAckSchema,
  MultisigBrokerMessage,
  MultisigBrokerMessageSchema,
  MultisigBrokerMessageWithError,
  MultisigBrokerMessageWithErrorSchema,
  Round1PublicPackageMessage,
  Round2PublicPackageMessage,
  SignatureShareMessage,
  SigningCommitmentMessage,
  SigningGetStatusMessage,
  SigningStartSessionMessage,
  SigningStatusMessage,
  SigningStatusSchema,
} from '../messages'

const RETRY_INTERVAL = 5000
const CONNECTION_TIMEOUT = 60 * 1000
export abstract class MultisigClient {
  readonly logger: Logger
  readonly hostname: string
  readonly port: number

  private started: boolean
  private isClosing = false
  private connected: boolean
  private connectWarned: boolean
  private connectTimeout: SetTimeoutToken | null
  private nextMessageId: number
  private readonly messageBuffer = new MessageBuffer('\n')

  private tryConnectUntil: number | null = null

  readonly onConnected = new Event<[]>()
  readonly onDisconnected = new Event<[]>()
  readonly onDkgStatus = new Event<[DkgStatusMessage]>()
  readonly onSigningStatus = new Event<[SigningStatusMessage]>()
  readonly onConnectedMessage = new Event<[ConnectedMessage]>()
  readonly onJoinedSession = new Event<[JoinedSessionMessage]>()
  readonly onMultisigBrokerError = new Event<[MultisigBrokerMessageWithError]>()
  readonly onClientError = new Event<[MultisigClientError]>()

  sessionId: string | null = null
  passphrase: string | null = null
  identity: string | null = null

  retries: Map<number, NodeJS.Timer> = new Map()

  constructor(options: { hostname: string; port: number; logger: Logger }) {
    this.logger = options.logger
    this.hostname = options.hostname
    this.port = options.port

    this.started = false
    this.nextMessageId = 0
    this.connected = false
    this.connectWarned = false
    this.connectTimeout = null
  }

  get connectionString(): string {
    const passphrase = this.passphrase ? encodeURIComponent(this.passphrase) : ''
    return `tcp://${this.sessionId}:${passphrase}@${this.hostname}:${this.port}`
  }

  get key(): xchacha20poly1305.XChaCha20Poly1305Key {
    if (!this.sessionId || !this.passphrase) {
      throw new Error('Client must join a session before encrypting/decrypting messages')
    }

    const sessionIdBytes = Buffer.from(this.sessionId)
    const salt = sessionIdBytes.subarray(0, 32)
    const nonce = sessionIdBytes.subarray(sessionIdBytes.length - 24)

    return xchacha20poly1305.XChaCha20Poly1305Key.fromParts(this.passphrase, salt, nonce)
  }

  protected abstract connect(): Promise<void>
  protected abstract writeData(data: string): void
  protected abstract close(): Promise<void>

  start(): void {
    if (this.started) {
      return
    }

    this.started = true
    this.logger.debug('Connecting to server...')
    void this.startConnecting()
  }

  private async startConnecting(): Promise<void> {
    if (this.isClosing) {
      return
    }

    if (!this.tryConnectUntil) {
      this.tryConnectUntil = Date.now() + CONNECTION_TIMEOUT
    } else if (Date.now() > this.tryConnectUntil) {
      clearTimeout(this.connectTimeout ?? undefined)
      throw new Error(`Timed out connecting to server at ${this.hostname}:${this.port}`)
    }

    const connected = await this.connect()
      .then(() => true)
      .catch(() => false)

    if (!this.started) {
      return
    }

    if (!connected) {
      if (!this.connectWarned) {
        this.logger.warn(`Failed to connect to server, retrying...`)
        this.connectWarned = true
      }

      this.connectTimeout = setTimeout(() => void this.startConnecting(), 5000)
      return
    }

    this.tryConnectUntil = null
    this.connectWarned = false
    this.onConnect()
    this.onConnected.emit()

    if (this.sessionId && this.passphrase && this.identity) {
      this.logger.debug(`Rejoining session ${this.sessionId}`)
      this.joinSession(this.sessionId, this.passphrase, this.identity)
    }
  }

  stop(): void {
    this.isClosing = true
    void this.close()

    if (this.connectTimeout) {
      clearTimeout(this.connectTimeout)
    }

    for (const retryInterval of this.retries.values()) {
      clearInterval(retryInterval)
    }
  }

  isConnected(): boolean {
    return this.connected
  }

  joinSession(sessionId: string, passphrase: string, identity: string): void {
    this.sessionId = sessionId
    this.passphrase = passphrase
    this.identity = identity
    this.send('join_session', { identity })
  }

  startDkgSession(
    passphrase: string,
    maxSigners: number,
    minSigners: number,
    identity: string,
  ): void {
    this.sessionId = uuid()
    this.passphrase = passphrase
    this.identity = identity
    const challenge = this.key.encrypt(Buffer.from('DKG')).toString('hex')
    this.send('dkg.start_session', { maxSigners, minSigners, challenge, identity })
  }

  startSigningSession(
    passphrase: string,
    numSigners: number,
    unsignedTransaction: string,
    identity: string,
    allowedIdentities?: string[],
  ): void {
    this.sessionId = uuid()
    this.passphrase = passphrase
    this.identity = identity
    const challenge = this.key.encrypt(Buffer.from('SIGNING')).toString('hex')
    this.send('sign.start_session', {
      numSigners,
      unsignedTransaction,
      challenge,
      identity,
      allowedIdentities,
    })
  }

  submitRound1PublicPackage(round1PublicPackage: string): void {
    this.send('dkg.round1', { package: round1PublicPackage })
  }

  submitRound2PublicPackage(round2PublicPackage: string): void {
    this.send('dkg.round2', { package: round2PublicPackage })
  }

  getDkgStatus(): void {
    this.send('dkg.get_status', {})
  }

  submitSigningCommitment(signingCommitment: string): void {
    this.send('sign.commitment', { signingCommitment })
  }

  submitSignatureShare(signatureShare: string): void {
    this.send('sign.share', { signatureShare })
  }

  getSigningStatus(): void {
    this.send('sign.get_status', {})
  }

  private send(method: 'join_session', body: JoinSessionMessage): void
  private send(method: 'dkg.start_session', body: DkgStartSessionMessage): void
  private send(method: 'sign.start_session', body: SigningStartSessionMessage): void
  private send(method: 'dkg.round1', body: Round1PublicPackageMessage): void
  private send(method: 'dkg.round2', body: Round2PublicPackageMessage): void
  private send(method: 'dkg.get_status', body: DkgGetStatusMessage): void
  private send(method: 'sign.commitment', body: SigningCommitmentMessage): void
  private send(method: 'sign.share', body: SignatureShareMessage): void
  private send(method: 'sign.get_status', body: SigningGetStatusMessage): void
  private send(method: string, body?: unknown): void {
    if (!this.sessionId) {
      throw new Error('Client must join a session before sending messages')
    }

    if (!this.connected) {
      return
    }

    const messageId = this.nextMessageId++

    const message: MultisigBrokerMessage = {
      id: messageId,
      method,
      sessionId: this.sessionId,
      body: this.encryptMessageBody(body),
    }

    this.writeData(JSON.stringify(message) + '\n')

    this.retries.set(
      messageId,
      setInterval(() => {
        this.writeData(JSON.stringify(message) + '\n')
      }, RETRY_INTERVAL),
    )
  }

  protected onConnect(): void {
    this.connected = true

    this.logger.debug('Successfully connected to server')
  }

  protected onDisconnect = (): void => {
    this.connected = false
    this.messageBuffer.clear()

    if (!this.isClosing) {
      this.logger.warn('Disconnected from server unexpectedly. Reconnecting.')
      this.connectTimeout = setTimeout(() => void this.startConnecting(), 5000)
    }

    this.onDisconnected.emit()
  }

  protected onError = (error: unknown): void => {
    this.logger.error(`Error ${ErrorUtils.renderError(error)}`)
  }

  protected async onData(data: Buffer): Promise<void> {
    this.messageBuffer.write(data)

    for (const message of this.messageBuffer.readMessages()) {
      const payload: unknown = JSON.parse(message)

      const header = await YupUtils.tryValidate(MultisigBrokerMessageSchema, payload)

      if (header.error) {
        // Try the error message instead.
        const headerWithError = await YupUtils.tryValidate(
          MultisigBrokerMessageWithErrorSchema,
          payload,
        )
        if (headerWithError.error) {
          throw new ServerMessageMalformedError(header.error)
        }
        this.logger.debug(
          `Server sent error ${headerWithError.result.error.message} for id ${headerWithError.result.error.id}`,
        )
        this.cancelRetry(headerWithError.result.error.id)
        this.onMultisigBrokerError.emit(headerWithError.result)
        return
      }

      this.logger.debug(`Server sent ${header.result.method} message`)

      switch (header.result.method) {
        case 'ack': {
          const body = await YupUtils.tryValidate(MultisigBrokerAckSchema, header.result.body)

          if (body.error) {
            throw new ServerMessageMalformedError(body.error, header.result.method)
          }

          this.cancelRetry(body.result.messageId)
          break
        }
        case 'dkg.status': {
          const body = await YupUtils.tryValidate(DkgStatusSchema, header.result.body)

          if (body.error) {
            throw new ServerMessageMalformedError(body.error, header.result.method)
          }

          const decrypted = this.decryptMessageBody<DkgStatusMessage>(body.result)
          this.onDkgStatus.emit(decrypted)
          break
        }
        case 'sign.status': {
          const body = await YupUtils.tryValidate(SigningStatusSchema, header.result.body)

          if (body.error) {
            throw new ServerMessageMalformedError(body.error, header.result.method)
          }

          const decrypted = this.decryptMessageBody<SigningStatusMessage>(body.result)
          this.onSigningStatus.emit(decrypted)
          break
        }
        case 'connected': {
          const body = await YupUtils.tryValidate(ConnectedMessageSchema, header.result.body)

          if (body.error) {
            throw new ServerMessageMalformedError(body.error, header.result.method)
          }

          this.onConnectedMessage.emit(body.result)
          break
        }
        case 'joined_session': {
          const body = await YupUtils.tryValidate(JoinedSessionSchema, header.result.body)
          if (body.error) {
            throw new ServerMessageMalformedError(body.error, header.result.method)
          }

          try {
            const decrypted = this.decryptMessageBody<JoinedSessionMessage>(body.result)
            this.onJoinedSession.emit(decrypted)
            break
          } catch (e) {
            this.onClientError.emit(
              new SessionDecryptionError(
                'Failed to decrypt session challenge. Passphrase is incorrect.',
              ),
            )
            break
          }
        }

        default:
          throw new ServerMessageMalformedError(`Invalid message ${header.result.method}`)
      }
    }
  }

  cancelRetry(messageId: number): void {
    const retryInterval = this.retries.get(messageId)
    clearInterval(retryInterval)
    this.retries.delete(messageId)
  }

  private encryptMessageBody(body: unknown): object {
    let encrypted = body as object
    for (const [key, value] of Object.entries(body as object)) {
      if (typeof value === 'string') {
        encrypted = {
          ...encrypted,
          [key]: this.key.encrypt(Buffer.from(value)).toString('hex'),
        }
      } else if (value instanceof Array) {
        const encryptedItems = []
        for (const item of value) {
          if (typeof item === 'string') {
            encryptedItems.push(this.key.encrypt(Buffer.from(item)).toString('hex'))
          } else {
            encryptedItems.push(item)
          }
        }
        encrypted = {
          ...encrypted,
          [key]: encryptedItems,
        }
      }
    }

    return encrypted
  }

  private decryptMessageBody<T extends object>(body: T): T {
    let decrypted = body
    for (const [key, value] of Object.entries(body)) {
      if (typeof value === 'string') {
        decrypted = {
          ...decrypted,
          [key]: this.key.decrypt(Buffer.from(value, 'hex')).toString(),
        }
      } else if (value instanceof Array) {
        const decryptedItems = []
        for (const item of value) {
          if (typeof item === 'string') {
            try {
              decryptedItems.push(this.key.decrypt(Buffer.from(item, 'hex')).toString())
            } catch {
              this.logger.debug(
                'Failed to decrypt submitted session data. Skipping invalid data.',
              )
            }
          } else {
            decryptedItems.push(item)
          }
        }
        decrypted = {
          ...decrypted,
          [key]: decryptedItems,
        }
      }
    }

    return decrypted
  }
}
