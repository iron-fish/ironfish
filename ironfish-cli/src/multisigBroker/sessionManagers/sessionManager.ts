/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert, Logger, PromiseUtils } from '@ironfish/sdk'
import { ux } from '@oclif/core'
import { MultisigClient } from '../clients'
import { MultisigBrokerUtils } from '../utils'

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
  client: MultisigClient
  sessionId: string | null

  constructor(options: {
    logger: Logger
    hostname: string
    port: number
    passphrase: string
    sessionId?: string
    tls?: boolean
  }) {
    super({ logger: options.logger })

    this.client = MultisigBrokerUtils.createClient(options.hostname, options.port, {
      passphrase: options.passphrase,
      tls: options.tls ?? true,
      logger: this.logger,
    })

    this.sessionId = options.sessionId ?? null
  }

  protected async connect(): Promise<void> {
    let confirmed = false

    this.client.start()

    this.client.onConnectedMessage.on(() => {
      confirmed = true
    })

    while (!confirmed) {
      await PromiseUtils.sleep(1000)
    }

    this.client.onConnectedMessage.clear()
  }

  async joinSession(sessionId: string): Promise<void> {
    await this.connect()

    this.client.joinSession(sessionId)

    await this.waitForJoinedSession()
    this.sessionId = sessionId
  }

  protected async waitForJoinedSession(): Promise<void> {
    Assert.isNotNull(this.client)
    let confirmed = false

    ux.action.start(`Waiting to join session: ${this.client.sessionId}`)
    this.client.onJoinedSession.on(() => {
      confirmed = true
    })

    while (!confirmed) {
      await PromiseUtils.sleep(1000)
    }

    this.client.onJoinedSession.clear()
    ux.action.stop()
  }

  endSession(): void {
    this.client.stop()
  }

  abstract getSessionConfig(): Promise<object>
}
