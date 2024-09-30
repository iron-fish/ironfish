/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  ErrorUtils,
  Event,
  Logger,
  MessageBuffer,
  SetTimeoutToken,
  YupUtils,
} from '@ironfish/sdk'
import { ServerMessageMalformedError } from '../errors'
import {
  // Add these new imports
  CommitmentMessage,
  CommitmentSchema,
  DkgGetStatusMessage,
  DkgStatusMessage,
  DkgStatusSchema,
  IdentityMessage,
  IdentitySchema,
  Round1PublicPackageMessage,
  Round1PublicPackageSchema,
  Round2PublicPackageMessage,
  Round2PublicPackageSchema,
  SignatureShareMessage,
  SignatureShareSchema,
  SigningPackageMessage,
  SigningPackageSchema,
  StratumMessage,
  StratumMessageSchema,
  StratumMessageWithError,
  StratumMessageWithErrorSchema,
} from '../messages'

export abstract class MultisigClient {
  readonly logger: Logger
  readonly version: number

  private started: boolean
  private isClosing = false
  private connected: boolean
  private connectWarned: boolean
  private connectTimeout: SetTimeoutToken | null
  private nextMessageId: number
  private readonly messageBuffer = new MessageBuffer('\n')

  private disconnectUntil: number | null = null

  readonly onConnected = new Event<[]>()
  readonly onIdentity = new Event<[IdentityMessage]>()
  readonly onRound1PublicPackage = new Event<[Round1PublicPackageMessage]>()
  readonly onRound2PublicPackage = new Event<[Round2PublicPackageMessage]>()
  readonly onDkgStatus = new Event<[DkgStatusMessage]>()
  readonly onStratumError = new Event<[StratumMessageWithError]>()

  // Add these new events for the signing process
  readonly onCommitment = new Event<[CommitmentMessage]>()
  readonly onSigningPackage = new Event<[SigningPackageMessage]>()
  readonly onSignatureShare = new Event<[SignatureShareMessage]>()

  constructor(options: { logger: Logger }) {
    this.logger = options.logger
    this.version = 3

    this.started = false
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
    this.logger.debug('Connecting to server...')
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
        this.logger.warn(`Failed to connect to server, retrying...`)
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

  isConnected(): boolean {
    return this.connected
  }

  submitIdentity(identity: string): void {
    this.send('identity', { identity })
  }

  submitRound1PublicPackage(round1PublicPackage: string): void {
    this.send('dkg.round1', { package: round1PublicPackage })
  }

  submitRound2PublicPackage(round2PublicPackage: string): void {
    this.send('dkg.round2', { package: round2PublicPackage })
  }

  // Add these new methods for the signing process
  submitCommitment(commitment: string): void {
    this.send('multisig.commitment', { commitment })
  }

  submitSigningPackage(signingPackage: string): void {
    this.send('multisig.signing_package', { package: signingPackage })
  }

  submitSignatureShare(signatureShare: string): void {
    this.send('multisig.signature_share', { share: signatureShare })
  }

  getDkgStatus(): void {
    this.send('dkg.get_status', {})
  }

  private send(method: 'identity', body: IdentityMessage): void
  private send(method: 'dkg.round1', body: Round1PublicPackageMessage): void
  private send(method: 'dkg.round2', body: Round2PublicPackageMessage): void
  private send(method: 'dkg.get_status', body: DkgGetStatusMessage): void
  // Add these new overloads for the signing process
  private send(method: 'multisig.commitment', body: CommitmentMessage): void
  private send(method: 'multisig.signing_package', body: SigningPackageMessage): void
  private send(method: 'multisig.signature_share', body: SignatureShareMessage): void
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

    this.logger.debug('Successfully connected to server')
  }

  protected onDisconnect = (): void => {
    this.connected = false
    this.messageBuffer.clear()

    if (!this.isClosing) {
      this.logger.warn('Disconnected from server unexpectedly. Reconnecting.')
      this.connectTimeout = setTimeout(() => void this.startConnecting(), 5000)
    }
  }

  protected onError = (error: unknown): void => {
    this.logger.error(`Error ${ErrorUtils.renderError(error)}`)
  }

  protected async onData(data: Buffer): Promise<void> {
    this.messageBuffer.write(data)

    for (const message of this.messageBuffer.readMessages()) {
      const payload: unknown = JSON.parse(message)

      const header = await YupUtils.tryValidate(StratumMessageSchema, payload)

      if (header.error) {
        // Try the error message instead.
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
        case 'identity': {
          const body = await YupUtils.tryValidate(IdentitySchema, header.result.body)

          if (body.error) {
            throw new ServerMessageMalformedError(body.error, header.result.method)
          }

          this.onIdentity.emit(body.result)
          break
        }
        case 'dkg.round1': {
          const body = await YupUtils.tryValidate(Round1PublicPackageSchema, header.result.body)

          if (body.error) {
            throw new ServerMessageMalformedError(body.error, header.result.method)
          }

          this.onRound1PublicPackage.emit(body.result)
          break
        }
        case 'dkg.round2': {
          const body = await YupUtils.tryValidate(Round2PublicPackageSchema, header.result.body)

          if (body.error) {
            throw new ServerMessageMalformedError(body.error, header.result.method)
          }

          this.onRound2PublicPackage.emit(body.result)
          break
        }
        case 'dkg.status': {
          const body = await YupUtils.tryValidate(DkgStatusSchema, header.result.body)

          if (body.error) {
            throw new ServerMessageMalformedError(body.error, header.result.method)
          }

          this.onDkgStatus.emit(body.result)
          break
        }
        case 'multisig.commitment': {
          const body = await YupUtils.tryValidate(CommitmentSchema, header.result.body)

          if (body.error) {
            throw new ServerMessageMalformedError(body.error, header.result.method)
          }

          this.onCommitment.emit(body.result)
          break
        }
        case 'multisig.signing_package': {
          const body = await YupUtils.tryValidate(SigningPackageSchema, header.result.body)

          if (body.error) {
            throw new ServerMessageMalformedError(body.error, header.result.method)
          }

          this.onSigningPackage.emit(body.result)
          break
        }
        case 'multisig.signature_share': {
          const body = await YupUtils.tryValidate(SignatureShareSchema, header.result.body)

          if (body.error) {
            throw new ServerMessageMalformedError(body.error, header.result.method)
          }

          this.onSignatureShare.emit(body.result)
          break
        }

        default:
          throw new ServerMessageMalformedError(`Invalid message ${header.result.method}`)
      }
    }
  }
}