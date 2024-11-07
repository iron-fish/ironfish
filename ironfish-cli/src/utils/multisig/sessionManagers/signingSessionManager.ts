/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Logger, PromiseUtils, UnsignedTransaction } from '@ironfish/sdk'
import { ux } from '@oclif/core'
import * as ui from '../../../ui'
import { MultisigClientSessionManager, MultisigSessionManager } from './sessionManager'

export function createSigningSessionManager(options: {
  logger: Logger
  server?: boolean
  connection?: string
  hostname?: string
  port?: number
  passphrase?: string
  sessionId?: string
  tls?: boolean
}): SigningSessionManager {
  if (
    options.server ||
    options.connection ||
    options.hostname ||
    options.port ||
    options.sessionId
  ) {
    return new MultisigClientSigningSessionManager(options)
  } else {
    return new MultisigSigningSessionManager({ logger: options.logger })
  }
}

export interface SigningSessionManager extends MultisigSessionManager {
  startSession(options: {
    numSigners?: number
    unsignedTransaction?: string
    identity: string
    allowedIdentities?: string[]
  }): Promise<{ numSigners: number; unsignedTransaction: UnsignedTransaction }>
  getIdentities(options: {
    identity: string
    numSigners: number
    accountName?: string
  }): Promise<string[]>
  getSigningCommitments(options: {
    signingCommitment: string
    numSigners: number
  }): Promise<string[]>
  getSignatureShares(options: { signatureShare: string; numSigners: number }): Promise<string[]>
}

export class MultisigClientSigningSessionManager
  extends MultisigClientSessionManager
  implements SigningSessionManager
{
  async startSession(options: {
    numSigners?: number
    unsignedTransaction?: string
    identity: string
    allowedIdentities?: string[]
  }): Promise<{ numSigners: number; unsignedTransaction: UnsignedTransaction }> {
    if (!this.sessionId) {
      await this.promptSessionConnection()
    }

    if (!this.passphrase) {
      this.passphrase = await ui.inputPrompt(
        'Enter the passphrase for the multisig session',
        true,
      )
    }

    if (this.sessionId) {
      await this.joinSession(this.sessionId, this.passphrase, options.identity)
      return this.getSessionConfig()
    }

    const { numSigners, unsignedTransaction } = await inputSigningConfig({
      ...options,
      logger: this.logger,
    })

    await this.connect()

    this.client.startSigningSession(
      this.passphrase,
      numSigners,
      unsignedTransaction,
      options.identity,
      options.allowedIdentities,
    )
    this.sessionId = this.client.sessionId

    this.logger.info(`\nStarting new signing session: ${this.sessionId}\n`)

    await this.waitForJoinedSession()

    this.logger.info('\nSigning session connection string:')
    this.logger.info(`${this.client.connectionString}`)

    return {
      numSigners,
      unsignedTransaction: new UnsignedTransaction(Buffer.from(unsignedTransaction, 'hex')),
    }
  }

  async getSessionConfig(): Promise<{
    unsignedTransaction: UnsignedTransaction
    numSigners: number
  }> {
    let numSigners = 0
    let unsignedTransactionHex = ''
    let waiting = true
    this.client.onSigningStatus.on((message) => {
      numSigners = message.numSigners
      unsignedTransactionHex = message.unsignedTransaction
      waiting = false
    })

    ux.action.start('Waiting for signer config from server')
    while (waiting) {
      this.client.getSigningStatus()
      await PromiseUtils.sleep(3000)
    }
    this.client.onSigningStatus.clear()
    ux.action.stop()

    const unsignedTransaction = new UnsignedTransaction(
      Buffer.from(unsignedTransactionHex, 'hex'),
    )

    return { numSigners, unsignedTransaction }
  }

  async getIdentities(options: { identity: string; numSigners: number }): Promise<string[]> {
    const { identity, numSigners } = options

    let identities = [identity]

    this.client.onSigningStatus.on((message) => {
      identities = message.identities
    })

    while (identities.length < numSigners) {
      this.client.getSigningStatus()
      if (!ux.action.running) {
        ux.action.start('Waiting for Identities from server')
      }
      ux.action.status = `${identities.length}/${numSigners}`
      await PromiseUtils.sleep(3000)
    }

    this.client.onSigningStatus.clear()
    ux.action.stop()

    return identities
  }

  async getSigningCommitments(options: {
    signingCommitment: string
    numSigners: number
  }): Promise<string[]> {
    const { signingCommitment, numSigners } = options

    this.client.submitSigningCommitment(signingCommitment)

    let signingCommitments = [signingCommitment]

    this.client.onSigningStatus.on((message) => {
      signingCommitments = message.signingCommitments
    })

    while (signingCommitments.length < numSigners) {
      this.client.getSigningStatus()
      if (!ux.action.running) {
        ux.action.start('Waiting for Signing Commitments from server')
      }
      ux.action.status = `${signingCommitments.length}/${numSigners}`
      await PromiseUtils.sleep(3000)
    }

    this.client.onSigningStatus.clear()
    ux.action.stop()

    return signingCommitments
  }

  async getSignatureShares(options: {
    signatureShare: string
    numSigners: number
  }): Promise<string[]> {
    const { signatureShare, numSigners } = options

    this.client.submitSignatureShare(signatureShare)

    let signatureShares = [signatureShare]

    this.client.onSigningStatus.on((message) => {
      signatureShares = message.signatureShares
    })

    while (signatureShares.length < numSigners) {
      this.client.getSigningStatus()
      if (!ux.action.running) {
        ux.action.start('Waiting for Signature Shares from server')
      }
      ux.action.status = `${signatureShares.length}/${numSigners}`
      await PromiseUtils.sleep(3000)
    }

    this.client.onSigningStatus.clear()
    ux.action.stop()

    return signatureShares
  }
}

export class MultisigSigningSessionManager
  extends MultisigSessionManager
  implements SigningSessionManager
{
  async startSession(options: {
    numSigners?: number
    unsignedTransaction?: string
  }): Promise<{ numSigners: number; unsignedTransaction: UnsignedTransaction }> {
    const { numSigners, unsignedTransaction } = await inputSigningConfig({
      ...options,
      logger: this.logger,
    })

    return {
      numSigners,
      unsignedTransaction: new UnsignedTransaction(Buffer.from(unsignedTransaction, 'hex')),
    }
  }

  endSession(): void {
    return
  }

  async getIdentities(options: {
    accountName: string
    identity: string
    numSigners: number
  }): Promise<string[]> {
    const { accountName, identity, numSigners } = options

    this.logger.info(`Identity for ${accountName}: \n${identity} \n`)
    this.logger.info('Share your participant identity with other signers.')

    this.logger.info(
      `Enter ${numSigners - 1} identities of the participants (excluding your own)`,
    )

    return ui.collectStrings('Participant Identity', numSigners - 1, {
      additionalStrings: [identity],
      logger: this.logger,
    })
  }

  async getSigningCommitments(options: {
    signingCommitment: string
    numSigners: number
  }): Promise<string[]> {
    const { signingCommitment, numSigners } = options

    this.logger.info('\n============================================')
    this.logger.info('\nCommitment:')
    this.logger.info(signingCommitment)
    this.logger.info('\n============================================')

    this.logger.info('\nShare your commitment with other participants.')

    this.logger.info(
      `Enter ${numSigners - 1} commitments of the participants (excluding your own)`,
    )

    return ui.collectStrings('Commitment', numSigners - 1, {
      additionalStrings: [signingCommitment],
      logger: this.logger,
    })
  }

  async getSignatureShares(options: {
    signatureShare: string
    numSigners: number
  }): Promise<string[]> {
    const { signatureShare, numSigners } = options
    this.logger.info('\n============================================')
    this.logger.info('\nSignature Share:')
    this.logger.info(signatureShare)
    this.logger.info('\n============================================')

    this.logger.info('\nShare your signature share with other participants.')

    this.logger.info(
      `Enter ${numSigners - 1} signature shares of the participants (excluding your own)`,
    )

    return ui.collectStrings('Signature Share', numSigners - 1, {
      additionalStrings: [signatureShare],
      logger: this.logger,
    })
  }
}

async function inputSigningConfig(options: {
  logger: Logger
  numSigners?: number
  unsignedTransaction?: string
}): Promise<{ numSigners: number; unsignedTransaction: string }> {
  const unsignedTransaction =
    options.unsignedTransaction ??
    (await ui.longPrompt('Enter the unsigned transaction', { required: true }))

  const numSigners =
    options.numSigners ??
    (await ui.inputNumberPrompt(
      options.logger,
      'Enter the number of participants in signing this transaction',
      { required: true, integer: true },
    ))

  if (numSigners < 2) {
    throw Error('Minimum number of participants must be at least 2')
  }

  return { numSigners, unsignedTransaction }
}
