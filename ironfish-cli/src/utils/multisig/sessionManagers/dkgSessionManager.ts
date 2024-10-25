/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Logger, PromiseUtils } from '@ironfish/sdk'
import { ux } from '@oclif/core'
import * as ui from '../../../ui'
import { MultisigClientSessionManager, MultisigSessionManager } from './sessionManager'

export function createDkgSessionManager(options: {
  logger: Logger
  server?: boolean
  connection?: string
  hostname?: string
  port?: number
  passphrase?: string
  sessionId?: string
  tls?: boolean
}): DkgSessionManager {
  if (
    options.server ||
    options.connection ||
    options.hostname ||
    options.port ||
    options.sessionId
  ) {
    return new MultisigClientDkgSessionManager(options)
  } else {
    return new MultisigDkgSessionManager({ logger: options.logger })
  }
}

export interface DkgSessionManager extends MultisigSessionManager {
  startSession(options: {
    totalParticipants?: number
    minSigners?: number
    ledger?: boolean
    identity: string
  }): Promise<{ totalParticipants: number; minSigners: number }>
  getIdentities(options: {
    identity: string
    totalParticipants: number
    accountName?: string
  }): Promise<string[]>
  getRound1PublicPackages(options: {
    round1PublicPackage: string
    totalParticipants: number
    accountName?: string
    round1SecretPackage?: string
  }): Promise<string[]>
  getRound2PublicPackages(options: {
    round2PublicPackage: string
    totalParticipants: number
    accountName?: string
    round2SecretPackage?: string
  }): Promise<string[]>
}

export class MultisigClientDkgSessionManager
  extends MultisigClientSessionManager
  implements DkgSessionManager
{
  async startSession(options: {
    totalParticipants?: number
    minSigners?: number
    ledger?: boolean
    identity: string
  }): Promise<{ totalParticipants: number; minSigners: number }> {
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

    const { totalParticipants, minSigners } = await inputDkgConfig({
      logger: this.logger,
      totalParticipants: options.totalParticipants,
      minSigners: options.minSigners,
      ledger: options.ledger,
    })

    await this.connect()

    this.client.startDkgSession(
      this.passphrase,
      totalParticipants,
      minSigners,
      options.identity,
    )
    this.sessionId = this.client.sessionId

    this.logger.info(`\nStarted new DKG session: ${this.sessionId}\n`)

    await this.waitForJoinedSession()

    this.logger.info('\nDKG session connection string:')
    this.logger.info(`${this.client.connectionString}`)

    return { totalParticipants, minSigners }
  }

  async getSessionConfig(): Promise<{ totalParticipants: number; minSigners: number }> {
    let totalParticipants = 0
    let minSigners = 0
    let waiting = true
    this.client.onDkgStatus.on((message) => {
      totalParticipants = message.maxSigners
      minSigners = message.minSigners
      waiting = false
    })

    ux.action.start('Waiting for signer config from server')
    while (waiting) {
      this.client.getDkgStatus()
      await PromiseUtils.sleep(3000)
    }
    this.client.onDkgStatus.clear()
    ux.action.stop()

    return { totalParticipants, minSigners }
  }

  async getIdentities(options: {
    identity: string
    totalParticipants: number
  }): Promise<string[]> {
    const { identity, totalParticipants } = options

    let identities = [identity]
    this.client.onDkgStatus.on((message) => {
      identities = message.identities
    })

    while (identities.length < totalParticipants) {
      this.client.getDkgStatus()
      if (!ux.action.running) {
        ux.action.start('Waiting for Identities from server')
      }
      ux.action.status = `${identities.length}/${totalParticipants}`
      await PromiseUtils.sleep(3000)
    }

    this.client.onDkgStatus.clear()
    ux.action.stop()

    return identities
  }

  async getRound1PublicPackages(options: {
    round1PublicPackage: string
    totalParticipants: number
  }): Promise<string[]> {
    const { round1PublicPackage, totalParticipants } = options

    this.client.submitRound1PublicPackage(round1PublicPackage)

    let round1PublicPackages = [round1PublicPackage]
    this.client.onDkgStatus.on((message) => {
      round1PublicPackages = message.round1PublicPackages
    })

    while (round1PublicPackages.length < totalParticipants) {
      this.client.getDkgStatus()
      if (!ux.action.running) {
        ux.action.start('Waiting for Round 1 Public Packages from server')
      }
      ux.action.status = `${round1PublicPackages.length}/${totalParticipants}`
      await PromiseUtils.sleep(3000)
    }

    this.client.onDkgStatus.clear()
    ux.action.stop()

    return round1PublicPackages
  }

  async getRound2PublicPackages(options: {
    round2PublicPackage: string
    totalParticipants: number
  }): Promise<string[]> {
    const { round2PublicPackage, totalParticipants } = options

    this.client.submitRound2PublicPackage(round2PublicPackage)

    let round2PublicPackages = [round2PublicPackage]
    this.client.onDkgStatus.on((message) => {
      round2PublicPackages = message.round2PublicPackages
    })

    while (round2PublicPackages.length < totalParticipants) {
      this.client.getDkgStatus()
      if (!ux.action.running) {
        ux.action.start('Waiting for Round 2 Public Packages from server')
      }
      ux.action.status = `${round2PublicPackages.length}/${totalParticipants}`
      await PromiseUtils.sleep(3000)
    }

    this.client.onDkgStatus.clear()
    ux.action.stop()

    return round2PublicPackages
  }
}

export class MultisigDkgSessionManager
  extends MultisigSessionManager
  implements DkgSessionManager
{
  async startSession(options: {
    totalParticipants?: number
    minSigners?: number
    ledger?: boolean
  }): Promise<{ totalParticipants: number; minSigners: number }> {
    return await inputDkgConfig({
      logger: this.logger,
      totalParticipants: options.totalParticipants,
      minSigners: options.minSigners,
      ledger: options.ledger,
    })
  }

  endSession(): void {
    return
  }

  async getIdentities(options: {
    accountName: string
    identity: string
    totalParticipants: number
  }): Promise<string[]> {
    this.logger.info(`Identity for ${options.accountName}:\n${options.identity}\n`)

    this.logger.info(
      `\nEnter ${
        options.totalParticipants - 1
      } identities of all other participants (excluding yours) `,
    )
    return await ui.collectStrings('Participant Identity', options.totalParticipants - 1, {
      additionalStrings: [options.identity],
      logger: this.logger,
    })
  }

  async getRound1PublicPackages(options: {
    accountName: string
    round1PublicPackage: string
    round1SecretPackage: string
    totalParticipants: number
  }): Promise<string[]> {
    const { accountName, round1SecretPackage, round1PublicPackage, totalParticipants } = options

    this.logger.info('\n============================================')
    this.logger.debug(`\nRound 1 Encrypted Secret Package for ${accountName}:`)
    this.logger.debug(round1SecretPackage)

    this.logger.info(`\nRound 1 Public Package for ${accountName}:`)
    this.logger.info(round1PublicPackage)
    this.logger.info('\n============================================')

    this.logger.info('\nShare your Round 1 Public Package with other participants.')
    this.logger.info(
      `\nEnter ${totalParticipants - 1} Round 1 Public Packages (excluding yours) `,
    )

    return await ui.collectStrings('Round 1 Public Package', totalParticipants - 1, {
      additionalStrings: [round1PublicPackage],
      logger: this.logger,
    })
  }

  async getRound2PublicPackages(options: {
    accountName: string
    round2SecretPackage: string
    round2PublicPackage: string
    totalParticipants: number
  }): Promise<string[]> {
    const { accountName, round2SecretPackage, round2PublicPackage, totalParticipants } = options

    this.logger.info('\n============================================')
    this.logger.debug(`\nRound 2 Encrypted Secret Package for ${accountName}:`)
    this.logger.debug(round2SecretPackage)

    this.logger.info(`\nRound 2 Public Package for ${accountName}:`)
    this.logger.info(round2PublicPackage)
    this.logger.info('\n============================================')

    this.logger.info('\nShare your Round 2 Public Package with other participants.')
    this.logger.info(
      `\nEnter ${totalParticipants - 1} Round 2 Public Packages (excluding yours) `,
    )

    return await ui.collectStrings('Round 2 Public Package', totalParticipants - 1, {
      additionalStrings: [round2PublicPackage],
      logger: this.logger,
    })
  }
}

async function inputDkgConfig(options: {
  logger: Logger
  totalParticipants?: number
  minSigners?: number
  ledger?: boolean
}): Promise<{
  totalParticipants: number
  minSigners: number
}> {
  let totalParticipants

  // eslint-disable-next-line no-constant-condition
  while (true) {
    totalParticipants =
      options.totalParticipants ??
      (await ui.inputNumberPrompt(options.logger, 'Enter the total number of participants', {
        required: true,
        integer: true,
      }))

    if (totalParticipants < 2) {
      options.logger.error('Total number of participants must be at least 2')
      continue
    }

    if (options.ledger && totalParticipants > 4) {
      options.logger.error('DKG with Ledger supports a maximum of 4 participants')
      continue
    }

    break
  }

  let minSigners

  // eslint-disable-next-line no-constant-condition
  while (true) {
    minSigners =
      options.minSigners ??
      (await ui.inputNumberPrompt(options.logger, 'Enter the number of minimum signers', {
        required: true,
        integer: true,
      }))

    if (minSigners < 2 || minSigners > totalParticipants) {
      options.logger.error(
        'Minimum number of signers must be between 2 and the total number of participants',
      )
      continue
    }

    break
  }

  return { totalParticipants, minSigners }
}
