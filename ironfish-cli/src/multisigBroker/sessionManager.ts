/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { PromiseUtils, UnsignedTransaction } from '@ironfish/sdk'
import { ux } from '@oclif/core'
import { MultisigClient } from './clients'

export class MultisigSessionManager {
  client: MultisigClient
  sessionId: string | null = null

  constructor(client: MultisigClient) {
    this.client = client
  }

  async connect(): Promise<void> {
    let confirmed = false

    this.client.start()

    this.client.onConnectedMessage.on(() => {
      confirmed = true
      this.client.onConnectedMessage.clear()
    })

    while (!confirmed) {
      await PromiseUtils.sleep(1000)
    }
  }

  leaveSession(): void {
    this.client.stop()
  }

  async joinSession(sessionId: string): Promise<void> {
    this.client.joinSession(sessionId)

    await this.waitForJoinedSession()
    this.sessionId = sessionId
  }

  protected async waitForJoinedSession(): Promise<void> {
    let confirmed = false

    this.client.onJoinedSession.on(() => {
      confirmed = true
      this.client.onJoinedSession.clear()
    })

    while (!confirmed) {
      await PromiseUtils.sleep(1000)
    }
  }
}

export class MultisigDkgSessionManager extends MultisigSessionManager {
  startSession(totalParticipants: number, minSigners: number): void {
    this.client.startDkgSession(totalParticipants, minSigners)
    this.sessionId = this.client.sessionId
  }

  async getConfig(): Promise<{ totalParticipants: number; minSigners: number }> {
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

  async getIdentities(identity: string, totalParticipants: number): Promise<string[]> {
    this.client.submitDkgIdentity(identity)

    let identities = [identity]
    this.client.onDkgStatus.on((message) => {
      identities = message.identities
    })

    ux.action.start('Waiting for Identities from server')
    while (identities.length < totalParticipants) {
      this.client.getDkgStatus()
      ux.action.status = `${identities.length}/${totalParticipants}`
      await PromiseUtils.sleep(3000)
    }

    this.client.onDkgStatus.clear()
    ux.action.stop()

    return identities
  }

  async getRound1PublicPackages(
    round1PublicPackage: string,
    totalParticipants: number,
  ): Promise<string[]> {
    this.client.submitRound1PublicPackage(round1PublicPackage)

    let round1PublicPackages = [round1PublicPackage]
    this.client.onDkgStatus.on((message) => {
      round1PublicPackages = message.round1PublicPackages
    })

    ux.action.start('Waiting for Round 1 Public Packages from server')
    while (round1PublicPackages.length < totalParticipants) {
      this.client.getDkgStatus()
      ux.action.status = `${round1PublicPackages.length}/${totalParticipants}`
      await PromiseUtils.sleep(3000)
    }

    this.client.onDkgStatus.clear()
    ux.action.stop()

    return round1PublicPackages
  }

  async getRound2PublicPackages(
    round2PublicPackage: string,
    totalParticipants: number,
  ): Promise<string[]> {
    this.client.submitRound2PublicPackage(round2PublicPackage)

    let round2PublicPackages = [round2PublicPackage]
    this.client.onDkgStatus.on((message) => {
      round2PublicPackages = message.round2PublicPackages
    })

    ux.action.start('Waiting for Round 2 Public Packages from server')
    while (round2PublicPackages.length < totalParticipants) {
      this.client.getDkgStatus()
      ux.action.status = `${round2PublicPackages.length}/${totalParticipants}`
      await PromiseUtils.sleep(3000)
    }

    this.client.onDkgStatus.clear()
    ux.action.stop()

    return round2PublicPackages
  }
}

export class MultisigSigningSessionManager extends MultisigSessionManager {
  startSession(numSigners: number, unsignedTransaction: string): void {
    this.client.startSigningSession(numSigners, unsignedTransaction)
    this.sessionId = this.client.sessionId
  }

  async getConfig(): Promise<{
    unsignedTransaction: UnsignedTransaction
    totalParticipants: number
  }> {
    let totalParticipants = 0
    let unsignedTransactionHex = ''
    let waiting = true
    this.client.onSigningStatus.on((message) => {
      totalParticipants = message.numSigners
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

    return { totalParticipants, unsignedTransaction }
  }

  async getIdentities(identity: string, numSigners: number): Promise<string[]> {
    this.client.submitSigningIdentity(identity)

    let identities = [identity]

    this.client.onSigningStatus.on((message) => {
      identities = message.identities
    })

    ux.action.start('Waiting for Identities from server')
    while (identities.length < numSigners) {
      this.client.getSigningStatus()
      ux.action.status = `${identities.length}/${numSigners}`
      await PromiseUtils.sleep(3000)
    }

    this.client.onSigningStatus.clear()
    ux.action.stop()

    return identities
  }

  async getSigningCommitments(
    signingCommitment: string,
    numSigners: number,
  ): Promise<string[]> {
    this.client.submitSigningCommitment(signingCommitment)

    let signingCommitments = [signingCommitment]

    this.client.onSigningStatus.on((message) => {
      signingCommitments = message.signingCommitments
    })

    ux.action.start('Waiting for Signing Commitments from server')
    while (signingCommitments.length < numSigners) {
      this.client.getSigningStatus()
      ux.action.status = `${signingCommitments.length}/${numSigners}`
      await PromiseUtils.sleep(3000)
    }

    this.client.onSigningStatus.clear()
    ux.action.stop()

    return signingCommitments
  }

  async getSignatureShares(signatureShare: string, numSigners: number): Promise<string[]> {
    this.client.submitSignatureShare(signatureShare)

    let signatureShares = [signatureShare]

    this.client.onSigningStatus.on((message) => {
      signatureShares = message.signatureShares
    })

    ux.action.start('Waiting for Signature Shares from server')
    while (signatureShares.length < numSigners) {
      this.client.getSigningStatus()
      ux.action.status = `${signatureShares.length}/${numSigners}`
      await PromiseUtils.sleep(3000)
    }

    this.client.onSigningStatus.clear()
    ux.action.stop()

    return signatureShares
  }
}
