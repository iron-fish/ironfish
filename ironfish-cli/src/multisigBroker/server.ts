/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ErrorUtils, Logger, YupUtils } from '@ironfish/sdk'
import net from 'net'
import { IMultisigBrokerAdapter } from './adapters'
import { ClientMessageMalformedError, MultisigBrokerErrorCodes } from './errors'
import {
  ConnectedMessage,
  DkgGetStatusSchema,
  DkgStartSessionSchema,
  DkgStatusMessage,
  JoinedSessionMessage,
  JoinSessionSchema,
  MultisigBrokerAckMessage,
  MultisigBrokerMessage,
  MultisigBrokerMessageSchema,
  MultisigBrokerMessageWithError,
  Round1PublicPackageSchema,
  Round2PublicPackageSchema,
  SignatureShareSchema,
  SigningCommitmentSchema,
  SigningGetStatusSchema,
  SigningStartSessionSchema,
  SigningStatusMessage,
} from './messages'
import { MultisigServerClient } from './serverClient'

enum MultisigSessionType {
  DKG = 'DKG',
  SIGNING = 'SIGNING',
}

interface MultisigSession {
  id: string
  type: MultisigSessionType
  clientIds: Set<number>
  status: DkgStatus | SigningStatus
  challenge: string
  timeout: NodeJS.Timeout | undefined
  allowedIdentities?: Set<string>
}

interface DkgSession extends MultisigSession {
  type: MultisigSessionType.DKG
  status: DkgStatus
}

interface SigningSession extends MultisigSession {
  type: MultisigSessionType.SIGNING
  status: SigningStatus
}

export type DkgStatus = {
  minSigners: number
  maxSigners: number
  identities: string[]
  round1PublicPackages: string[]
  round2PublicPackages: string[]
}

export type SigningStatus = {
  numSigners: number
  unsignedTransaction: string
  identities: string[]
  signingCommitments: string[]
  signatureShares: string[]
}

export class MultisigServer {
  readonly logger: Logger
  readonly adapters: IMultisigBrokerAdapter[] = []

  clients: Map<number, MultisigServerClient>
  nextClientId: number
  nextMessageId: number

  sessions: Map<string, MultisigSession> = new Map()

  private _isRunning = false
  private _startPromise: Promise<unknown> | null = null
  private idleSessionTimeout: number

  constructor(options: { logger: Logger; idleSessionTimeout?: number }) {
    this.logger = options.logger

    this.clients = new Map()
    this.nextClientId = 1
    this.nextMessageId = 1
    this.idleSessionTimeout = options.idleSessionTimeout ?? 600000
  }

  get isRunning(): boolean {
    return this._isRunning
  }

  /** Starts the MultisigBroker server and tells any attached adapters to start serving requests */
  async start(): Promise<void> {
    if (this._isRunning) {
      return
    }

    this._startPromise = Promise.all(this.adapters.map((a) => a.start()))
    this._isRunning = true
    await this._startPromise
  }

  /** Stops the MultisigBroker server and tells any attached adapters to stop serving requests */
  async stop(): Promise<void> {
    if (!this._isRunning) {
      return
    }

    if (this._startPromise) {
      await this._startPromise
    }

    for (const session of this.sessions.values()) {
      clearTimeout(session.timeout)
    }

    await Promise.all(this.adapters.map((a) => a.stop()))
    this._isRunning = false
  }

  /** Adds an adapter to the MultisigBroker server and starts it if the server has already been started */
  mount(adapter: IMultisigBrokerAdapter): void {
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

    this.send(socket, 'connected', '0', {})

    this.logger.debug(`Client ${client.id} connected: ${client.remoteAddress}`)
    this.clients.set(client.id, client)
  }

  private onDisconnect(client: MultisigServerClient): void {
    this.logger.debug(`Client ${client.id} disconnected  (${this.clients.size - 1} total)`)

    this.clients.delete(client.id)
    client.close()
    client.socket.removeAllListeners('close')
    client.socket.removeAllListeners('error')

    if (client.sessionId) {
      const sessionId = client.sessionId

      this.removeClientFromSession(client)

      if (!this.isSessionActive(sessionId)) {
        this.setSessionTimeout(sessionId)
      }
    }
  }

  private async onData(client: MultisigServerClient, data: Buffer): Promise<void> {
    client.messageBuffer.write(data)

    for (const split of client.messageBuffer.readMessages()) {
      const payload: unknown = JSON.parse(split)
      const { error: parseError, result: message } = await YupUtils.tryValidate(
        MultisigBrokerMessageSchema,
        payload,
      )

      if (parseError) {
        this.logger.debug(
          `Error parsing message from client ${client.id}: ${ErrorUtils.renderError(
            parseError,
            true,
          )}`,
        )
        client.close(parseError)
        this.clients.delete(client.id)
        return
      }

      this.logger.debug(`Client ${client.id} sent ${message.method} message`)
      this.send(client.socket, 'ack', message.sessionId, { messageId: message.id })

      if (message.method === 'dkg.start_session') {
        await this.handleDkgStartSessionMessage(client, message)
        return
      } else if (message.method === 'sign.start_session') {
        await this.handleSigningStartSessionMessage(client, message)
        return
      } else if (message.method === 'join_session') {
        await this.handleJoinSessionMessage(client, message)
        return
      } else if (message.method === 'dkg.round1') {
        await this.handleRound1PublicPackageMessage(client, message)
        return
      } else if (message.method === 'dkg.round2') {
        await this.handleRound2PublicPackageMessage(client, message)
        return
      } else if (message.method === 'dkg.get_status') {
        await this.handleDkgGetStatusMessage(client, message)
        return
      } else if (message.method === 'sign.commitment') {
        await this.handleSigningCommitmentMessage(client, message)
        return
      } else if (message.method === 'sign.share') {
        await this.handleSignatureShareMessage(client, message)
        return
      } else if (message.method === 'sign.get_status') {
        await this.handleSigningGetStatusMessage(client, message)
        return
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

  /**
   * If a client has the given session ID and is connected, the associated
   * session should still be considered active
   */
  private isSessionActive(sessionId: string): boolean {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return false
    }

    if (session.clientIds.size > 0) {
      return true
    }

    return false
  }

  private setSessionTimeout(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return
    }

    session.timeout = setTimeout(() => this.cleanupSession(sessionId), this.idleSessionTimeout)
  }

  private cleanupSession(sessionId: string): void {
    this.sessions.delete(sessionId)
    this.logger.debug(`Session ${sessionId} cleaned up. Active sessions: ${this.sessions.size}`)
  }

  private addClientToSession(client: MultisigServerClient, sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return
    }

    client.sessionId = session.id
    session.clientIds.add(client.id)

    clearTimeout(session.timeout)
    session.timeout = undefined
  }

  private removeClientFromSession(client: MultisigServerClient): void {
    if (!client.sessionId) {
      return
    }

    const session = this.sessions.get(client.sessionId)
    if (!session) {
      return
    }

    // If the session is in the collecting identities phase, we can safely
    // remove a disconnected client's identity from the list. Otherwise, if a
    // client disconnects and then reconnects, they can possibly be counted as
    // multiple identities, leaving the session in a bad state.
    if (client.identity != null) {
      if (isDkgSession(session)) {
        if (session.status.round1PublicPackages.length === 0) {
          const identIndex = session.status.identities.indexOf(client.identity)
          if (identIndex > -1) {
            session.status.identities.splice(identIndex, 1)
          }
        }
      } else if (isSigningSession(session)) {
        if (session.status.signingCommitments.length === 0) {
          const identIndex = session.status.identities.indexOf(client.identity)
          if (identIndex > -1) {
            session.status.identities.splice(identIndex, 1)
          }
        }
      }
    }

    client.sessionId = null
    session.clientIds.delete(client.id)
  }

  private broadcast(method: 'dkg.status', sessionId: string, body?: DkgStatusMessage): void
  private broadcast(method: 'sign.status', sessionId: string, body?: SigningStatusMessage): void
  private broadcast(method: string, sessionId: string, body?: unknown): void {
    const message: MultisigBrokerMessage = {
      id: this.nextMessageId++,
      method,
      sessionId,
      body,
    }

    const serialized = JSON.stringify(message) + '\n'

    this.logger.debug('broadcasting to clients', {
      method,
      sessionId,
      id: message.id,
      numClients: this.clients.size,
      messageLength: serialized.length,
    })

    let broadcasted = 0

    const session = this.sessions.get(sessionId)
    if (!session) {
      this.logger.debug(`Session ${sessionId} does not exist, broadcast failed`)
      return
    }

    for (const clientId of session.clientIds) {
      const client = this.clients.get(clientId)
      if (!client) {
        this.logger.debug(
          `Client ${clientId} does not exist, but session ${sessionId} thinks it does, removing.`,
        )
        session.clientIds.delete(clientId)
        continue
      }

      if (!client.connected) {
        continue
      }

      client.socket.write(serialized)
      broadcasted++
    }

    this.logger.debug('completed broadcast to clients', {
      method,
      sessionId,
      id: message.id,
      numClients: broadcasted,
      messageLength: serialized.length,
    })
  }

  send(
    socket: net.Socket,
    method: 'dkg.status',
    sessionId: string,
    body: DkgStatusMessage,
  ): void
  send(
    socket: net.Socket,
    method: 'sign.status',
    sessionId: string,
    body: SigningStatusMessage,
  ): void
  send(socket: net.Socket, method: 'connected', sessionId: string, body: ConnectedMessage): void
  send(
    socket: net.Socket,
    method: 'joined_session',
    sessionId: string,
    body: JoinedSessionMessage,
  ): void
  send(
    socket: net.Socket,
    method: 'ack',
    sessionId: string,
    body: MultisigBrokerAckMessage,
  ): void
  send(socket: net.Socket, method: string, sessionId: string, body?: unknown): void {
    const message: MultisigBrokerMessage = {
      id: this.nextMessageId++,
      method,
      sessionId,
      body,
    }

    const serialized = JSON.stringify(message) + '\n'
    socket.write(serialized)
  }

  sendErrorMessage(
    client: MultisigServerClient,
    id: number,
    message: string,
    code: number,
  ): void {
    const msg: MultisigBrokerMessageWithError = {
      id: this.nextMessageId++,
      error: {
        id,
        message,
        code,
      },
    }
    const serialized = JSON.stringify(msg) + '\n'
    client.socket.write(serialized)
  }

  async handleDkgStartSessionMessage(
    client: MultisigServerClient,
    message: MultisigBrokerMessage,
  ) {
    const body = await YupUtils.tryValidate(DkgStartSessionSchema, message.body)

    if (body.error) {
      return
    }

    const sessionId = message.sessionId

    if (this.sessions.has(sessionId)) {
      this.sendErrorMessage(
        client,
        message.id,
        `Duplicate sessionId: ${sessionId}`,
        MultisigBrokerErrorCodes.DUPLICATE_SESSION_ID,
      )
      return
    }

    const session = {
      id: sessionId,
      type: MultisigSessionType.DKG,
      clientIds: new Set<number>(),
      status: {
        maxSigners: body.result.maxSigners,
        minSigners: body.result.minSigners,
        identities: [body.result.identity],
        round1PublicPackages: [],
        round2PublicPackages: [],
      },
      challenge: body.result.challenge,
      timeout: undefined,
    }

    this.sessions.set(sessionId, session)

    this.logger.debug(`Client ${client.id} started dkg session ${message.sessionId}`)

    client.identity = body.result.identity
    this.addClientToSession(client, sessionId)

    this.send(client.socket, 'joined_session', message.sessionId, {
      challenge: session.challenge,
    })
  }

  async handleSigningStartSessionMessage(
    client: MultisigServerClient,
    message: MultisigBrokerMessage,
  ) {
    const body = await YupUtils.tryValidate(SigningStartSessionSchema, message.body)

    if (body.error) {
      return
    }

    const sessionId = message.sessionId

    if (this.sessions.has(sessionId)) {
      this.sendErrorMessage(
        client,
        message.id,
        `Duplicate sessionId: ${sessionId}`,
        MultisigBrokerErrorCodes.DUPLICATE_SESSION_ID,
      )
      return
    }

    const session = {
      id: sessionId,
      type: MultisigSessionType.SIGNING,
      clientIds: new Set<number>(),
      status: {
        numSigners: body.result.numSigners,
        unsignedTransaction: body.result.unsignedTransaction,
        identities: [body.result.identity],
        signingCommitments: [],
        signatureShares: [],
      },
      challenge: body.result.challenge,
      timeout: undefined,
      allowedIdentities: body.result.allowedIdentities
        ? new Set(body.result.allowedIdentities)
        : undefined,
    }

    this.sessions.set(sessionId, session)

    this.logger.debug(`Client ${client.id} started signing session ${message.sessionId}`)

    client.identity = body.result.identity
    this.addClientToSession(client, sessionId)

    this.send(client.socket, 'joined_session', message.sessionId, {
      challenge: session.challenge,
    })
  }

  async handleJoinSessionMessage(client: MultisigServerClient, message: MultisigBrokerMessage) {
    const body = await YupUtils.tryValidate(JoinSessionSchema, message.body)

    if (body.error) {
      return
    }

    const session = this.sessions.get(message.sessionId)
    if (!session) {
      this.sendErrorMessage(
        client,
        message.id,
        `Session not found: ${message.sessionId}`,
        MultisigBrokerErrorCodes.SESSION_ID_NOT_FOUND,
      )
      return
    }

    if (session.allowedIdentities && !session.allowedIdentities.has(body.result.identity)) {
      this.sendErrorMessage(
        client,
        message.id,
        'Identity not allowed to join this session',
        MultisigBrokerErrorCodes.IDENTITY_NOT_ALLOWED,
      )
      return
    }

    this.logger.debug(`Client ${client.id} joined session ${message.sessionId}`)

    this.addClientToSession(client, message.sessionId)

    this.send(client.socket, 'joined_session', message.sessionId, {
      challenge: session.challenge,
    })

    client.identity = body.result.identity
    if (!session.status.identities.includes(client.identity)) {
      session.status.identities.push(client.identity)
      this.sessions.set(message.sessionId, session)

      // Broadcast status after collecting all identities
      if (isDkgSession(session)) {
        if (session.status.identities.length === session.status.maxSigners) {
          this.broadcast('dkg.status', message.sessionId, session.status)
        }
      } else if (isSigningSession(session)) {
        if (session.status.identities.length === session.status.numSigners) {
          this.broadcast('sign.status', message.sessionId, session.status)
        }
      }
    }
  }

  async handleRound1PublicPackageMessage(
    client: MultisigServerClient,
    message: MultisigBrokerMessage,
  ) {
    const body = await YupUtils.tryValidate(Round1PublicPackageSchema, message.body)

    if (body.error) {
      return
    }

    const session = this.sessions.get(message.sessionId)
    if (!session) {
      this.sendErrorMessage(
        client,
        message.id,
        `Session not found: ${message.sessionId}`,
        MultisigBrokerErrorCodes.SESSION_ID_NOT_FOUND,
      )
      return
    }

    if (!isDkgSession(session)) {
      this.sendErrorMessage(
        client,
        message.id,
        `Session is not a dkg session: ${message.sessionId}`,
        MultisigBrokerErrorCodes.INVALID_DKG_SESSION_ID,
      )
      return
    }

    const round1PublicPackage = body.result.package
    if (!session.status.round1PublicPackages.includes(round1PublicPackage)) {
      session.status.round1PublicPackages.push(round1PublicPackage)
      this.sessions.set(message.sessionId, session)

      // Broadcast status after collecting all packages
      if (session.status.round1PublicPackages.length === session.status.maxSigners) {
        this.broadcast('dkg.status', message.sessionId, session.status)
      }
    }
  }

  async handleRound2PublicPackageMessage(
    client: MultisigServerClient,
    message: MultisigBrokerMessage,
  ) {
    const body = await YupUtils.tryValidate(Round2PublicPackageSchema, message.body)

    if (body.error) {
      return
    }

    const session = this.sessions.get(message.sessionId)
    if (!session) {
      this.sendErrorMessage(
        client,
        message.id,
        `Session not found: ${message.sessionId}`,
        MultisigBrokerErrorCodes.SESSION_ID_NOT_FOUND,
      )
      return
    }

    if (!isDkgSession(session)) {
      this.sendErrorMessage(
        client,
        message.id,
        `Session is not a dkg session: ${message.sessionId}`,
        MultisigBrokerErrorCodes.INVALID_DKG_SESSION_ID,
      )
      return
    }

    const round2PublicPackage = body.result.package
    if (!session.status.round2PublicPackages.includes(round2PublicPackage)) {
      session.status.round2PublicPackages.push(round2PublicPackage)
      this.sessions.set(message.sessionId, session)

      // Broadcast status after collecting all packages
      if (session.status.round2PublicPackages.length === session.status.maxSigners) {
        this.broadcast('dkg.status', message.sessionId, session.status)
      }
    }
  }

  async handleDkgGetStatusMessage(
    client: MultisigServerClient,
    message: MultisigBrokerMessage,
  ) {
    const body = await YupUtils.tryValidate(DkgGetStatusSchema, message.body)

    if (body.error) {
      return
    }

    const session = this.sessions.get(message.sessionId)
    if (!session) {
      this.sendErrorMessage(
        client,
        message.id,
        `Session not found: ${message.sessionId}`,
        MultisigBrokerErrorCodes.SESSION_ID_NOT_FOUND,
      )
      return
    }

    if (!isDkgSession(session)) {
      this.sendErrorMessage(
        client,
        message.id,
        `Session is not a dkg session: ${message.sessionId}`,
        MultisigBrokerErrorCodes.INVALID_DKG_SESSION_ID,
      )
      return
    }

    this.send(client.socket, 'dkg.status', message.sessionId, session.status)
  }

  async handleSigningCommitmentMessage(
    client: MultisigServerClient,
    message: MultisigBrokerMessage,
  ) {
    const body = await YupUtils.tryValidate(SigningCommitmentSchema, message.body)

    if (body.error) {
      return
    }

    const session = this.sessions.get(message.sessionId)
    if (!session) {
      this.sendErrorMessage(
        client,
        message.id,
        `Session not found: ${message.sessionId}`,
        MultisigBrokerErrorCodes.SESSION_ID_NOT_FOUND,
      )
      return
    }

    if (!isSigningSession(session)) {
      this.sendErrorMessage(
        client,
        message.id,
        `Session is not a signing session: ${message.sessionId}`,
        MultisigBrokerErrorCodes.INVALID_SIGNING_SESSION_ID,
      )
      return
    }

    const signingCommitment = body.result.signingCommitment
    if (!session.status.signingCommitments.includes(signingCommitment)) {
      session.status.signingCommitments.push(signingCommitment)
      this.sessions.set(message.sessionId, session)

      // Broadcast status after collecting all signing commitments
      if (session.status.signingCommitments.length === session.status.numSigners) {
        this.broadcast('sign.status', message.sessionId, session.status)
      }
    }
  }

  async handleSignatureShareMessage(
    client: MultisigServerClient,
    message: MultisigBrokerMessage,
  ) {
    const body = await YupUtils.tryValidate(SignatureShareSchema, message.body)

    if (body.error) {
      return
    }

    const session = this.sessions.get(message.sessionId)
    if (!session) {
      this.sendErrorMessage(
        client,
        message.id,
        `Session not found: ${message.sessionId}`,
        MultisigBrokerErrorCodes.SESSION_ID_NOT_FOUND,
      )
      return
    }

    if (!isSigningSession(session)) {
      this.sendErrorMessage(
        client,
        message.id,
        `Session is not a signing session: ${message.sessionId}`,
        MultisigBrokerErrorCodes.INVALID_SIGNING_SESSION_ID,
      )
      return
    }

    const signatureShare = body.result.signatureShare
    if (!session.status.signatureShares.includes(signatureShare)) {
      session.status.signatureShares.push(signatureShare)
      this.sessions.set(message.sessionId, session)

      // Broadcast status after collecting all signature shares
      if (session.status.signatureShares.length === session.status.numSigners) {
        this.broadcast('sign.status', message.sessionId, session.status)
      }
    }
  }

  async handleSigningGetStatusMessage(
    client: MultisigServerClient,
    message: MultisigBrokerMessage,
  ) {
    const body = await YupUtils.tryValidate(SigningGetStatusSchema, message.body)

    if (body.error) {
      return
    }

    const session = this.sessions.get(message.sessionId)
    if (!session) {
      this.sendErrorMessage(
        client,
        message.id,
        `Session not found: ${message.sessionId}`,
        MultisigBrokerErrorCodes.SESSION_ID_NOT_FOUND,
      )
      return
    }

    if (!isSigningSession(session)) {
      this.sendErrorMessage(
        client,
        message.id,
        `Session is not a signing session: ${message.sessionId}`,
        MultisigBrokerErrorCodes.INVALID_SIGNING_SESSION_ID,
      )
      return
    }

    this.send(client.socket, 'sign.status', message.sessionId, session.status)
  }
}

function isDkgSession(session: MultisigSession): session is DkgSession {
  return session.type === MultisigSessionType.DKG
}

function isSigningSession(session: MultisigSession): session is SigningSession {
  return session.type === MultisigSessionType.SIGNING
}
