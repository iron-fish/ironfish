/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  MultisigBrokerErrorCodes,
  MultisigBrokerUtils,
  MultisigClient,
  SessionDecryptionError,
} from '@ironfish/multisig-broker'
import { Logger, PromiseUtils } from '@ironfish/sdk'
import { ux } from '@oclif/core'
import * as ui from '../../../ui'

export abstract class MultisigSessionManager {
  sessionId: string | null = null
  logger: Logger

  constructor(options: { logger: Logger }) {
    this.logger = options.logger
  }

  abstract startSession(options: object): Promise<object>

  abstract endSession(): void
}

export abstract class MultisigClientSessionManager extends MultisigSessionManager {
  _client: MultisigClient | null = null

  hostname: string
  port: number
  sessionId: string | null
  passphrase: string | null
  tls: boolean

  constructor(options: {
    logger: Logger
    connection?: string
    hostname?: string
    port?: number
    passphrase?: string
    sessionId?: string
    tls?: boolean
  }) {
    super({ logger: options.logger })

    const { hostname, port, sessionId, passphrase } =
      MultisigBrokerUtils.parseConnectionOptions(options)

    this.hostname = hostname
    this.port = port
    this.sessionId = sessionId ?? null
    this.passphrase = passphrase ?? null
    this.tls = options.tls ?? true
  }

  async promptSessionConnection(): Promise<void> {
    const sessionInput = await ui.inputPrompt(
      'Enter the ID of a multisig session to join, or press enter to start a new session',
      false,
    )

    try {
      const url = new URL(sessionInput)
      this.hostname = url.hostname
      this.port = Number(url.port)
      this.sessionId = url.username
      this.passphrase = decodeURI(url.password)
    } catch (e) {
      if (e instanceof TypeError && e.message.includes('Invalid URL')) {
        this.sessionId = sessionInput
      } else {
        throw e
      }
    }
  }

  get client(): MultisigClient {
    if (!this._client) {
      throw new Error('MultisigClient has not been initialized')
    }
    return this._client
  }

  protected createClient() {
    if (this._client) {
      return
    }
    this._client = MultisigBrokerUtils.createClient(this.hostname, this.port, {
      tls: this.tls,
      logger: this.logger,
    })
  }

  protected async connect(): Promise<void> {
    this.createClient()

    if (this.client.isConnected()) {
      return
    }

    this.client.start()

    await this.waitForConnectedMessage()

    this.client.onDisconnected.on(async () => {
      await this.waitForConnectedMessage()
      await this.waitForJoinedSession()
    })
  }

  protected async waitForConnectedMessage(): Promise<void> {
    let confirmed = false

    ux.action.start(
      `Connecting to multisig broker server: ${this.client.hostname}:${this.client.port}`,
    )
    this.client.onConnectedMessage.on(() => {
      confirmed = true
    })

    while (!confirmed) {
      await PromiseUtils.sleep(1000)
    }

    this.client.onConnectedMessage.clear()
    ux.action.stop()
  }

  async joinSession(sessionId: string, passphrase: string, identity: string): Promise<void> {
    await this.connect()

    this.client.joinSession(sessionId, passphrase, identity)

    await this.waitForJoinedSession()
    this.sessionId = sessionId
  }

  protected async waitForJoinedSession(): Promise<void> {
    ux.action.start(`Waiting to join session: ${this.client.sessionId}`)

    let confirmed = false
    this.client.onJoinedSession.on(() => {
      confirmed = true
    })

    let clientError: unknown
    this.client.onClientError.on((error) => {
      clientError = error
    })

    this.client.onMultisigBrokerError.on((errorMessage) => {
      if (errorMessage.error.code === MultisigBrokerErrorCodes.SESSION_ID_NOT_FOUND) {
        clientError = new InvalidSessionError(errorMessage.error.message)
      } else if (errorMessage.error.code === MultisigBrokerErrorCodes.DKG_SESSION_FULL) {
        clientError = new DkgSessionFullError(errorMessage.error.message)
      } else if (errorMessage.error.code === MultisigBrokerErrorCodes.IDENTITY_NOT_ALLOWED) {
        // Throws error immediately instead of deferring to loop, below
        throw new IdentityNotAllowedError(errorMessage.error.message)
      }
    })

    while (!confirmed) {
      if (clientError) {
        if (clientError instanceof SessionDecryptionError) {
          this.passphrase = null
        } else if (clientError instanceof InvalidSessionError) {
          this.sessionId = null
        }
        ux.action.stop()
        throw clientError
      }
      await PromiseUtils.sleep(1000)
    }

    this.client.onJoinedSession.clear()
    ux.action.stop()
  }

  endSession(): void {
    this.client.onDisconnected.clear()
    this.client.stop()
  }

  abstract getSessionConfig(): Promise<object>
}

export class MultisigSessionError extends Error {
  name = this.constructor.name
}

export class DkgSessionFullError extends MultisigSessionError {}
export class InvalidSessionError extends MultisigSessionError {}
export class IdentityNotAllowedError extends MultisigSessionError {}
