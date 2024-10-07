/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Logger } from '@ironfish/sdk'
import {
  IronfishKeys,
  KeyResponse,
  ResponseDkgRound1,
  ResponseDkgRound2,
} from '@zondax/ledger-ironfish'
import { isResponseAddress, isResponseProofGenKey, isResponseViewKey, Ledger } from './ledger'

export class LedgerMultiSigner extends Ledger {
  constructor(logger?: Logger) {
    super(true, logger)
  }

  dkgGetIdentity = async (index: number): Promise<Buffer> => {
    this.logger.debug('Retrieving identity from ledger device.')

    const response = await this.tryInstruction((app) => app.dkgGetIdentity(index, false))

    return response.identity
  }

  dkgRound1 = async (
    index: number,
    identities: string[],
    minSigners: number,
  ): Promise<ResponseDkgRound1> => {
    this.logger.log('Please approve the request on your ledger device.')

    return this.tryInstruction((app) => app.dkgRound1(index, identities, minSigners))
  }

  dkgRound2 = async (
    index: number,
    round1PublicPackages: string[],
    round1SecretPackage: string,
  ): Promise<ResponseDkgRound2> => {
    this.logger.log('Please approve the request on your ledger device.')

    return this.tryInstruction((app) =>
      app.dkgRound2(index, round1PublicPackages, round1SecretPackage),
    )
  }

  dkgRound3 = async (
    index: number,
    participants: string[],
    round1PublicPackages: string[],
    round2PublicPackages: string[],
    round2SecretPackage: string,
    gskBytes: string[],
  ): Promise<void> => {
    this.logger.log('Please approve the request on your ledger device.')

    return this.tryInstruction((app) =>
      app.dkgRound3Min(
        index,
        participants,
        round1PublicPackages,
        round2PublicPackages,
        round2SecretPackage,
        gskBytes,
      ),
    )
  }

  dkgRetrieveKeys = async (): Promise<{
    publicAddress: string
    viewKey: string
    incomingViewKey: string
    outgoingViewKey: string
    proofAuthorizingKey: string
  }> => {
    const responseAddress: KeyResponse = await this.tryInstruction((app) =>
      app.dkgRetrieveKeys(IronfishKeys.PublicAddress),
    )

    if (!isResponseAddress(responseAddress)) {
      throw new Error(`No public address returned.`)
    }

    const responseViewKey = await this.tryInstruction((app) =>
      app.dkgRetrieveKeys(IronfishKeys.ViewKey),
    )

    if (!isResponseViewKey(responseViewKey)) {
      throw new Error(`No view key returned.`)
    }

    const responsePGK: KeyResponse = await this.tryInstruction((app) =>
      app.dkgRetrieveKeys(IronfishKeys.ProofGenerationKey),
    )

    if (!isResponseProofGenKey(responsePGK)) {
      throw new Error(`No proof authorizing key returned.`)
    }

    return {
      publicAddress: responseAddress.publicAddress.toString('hex'),
      viewKey: responseViewKey.viewKey.toString('hex'),
      incomingViewKey: responseViewKey.ivk.toString('hex'),
      outgoingViewKey: responseViewKey.ovk.toString('hex'),
      proofAuthorizingKey: responsePGK.nsk.toString('hex'),
    }
  }

  dkgGetPublicPackage = async (): Promise<Buffer> => {
    const response = await this.tryInstruction((app) => app.dkgGetPublicPackage())

    return response.publicPackage
  }

  reviewTransaction = async (transaction: string): Promise<Buffer> => {
    this.logger.info(
      'Please review and approve the outputs of this transaction on your ledger device.',
    )

    const { hash } = await this.tryInstruction((app) => app.reviewTransaction(transaction))

    return hash
  }

  dkgGetCommitments = async (transactionHash: string): Promise<Buffer> => {
    const { commitments } = await this.tryInstruction((app) =>
      app.dkgGetCommitments(transactionHash),
    )

    return commitments
  }

  dkgSign = async (
    randomness: string,
    frostSigningPackage: string,
    transactionHash: string,
  ): Promise<Buffer> => {
    const { signature } = await this.tryInstruction((app) =>
      app.dkgSign(randomness, frostSigningPackage, transactionHash),
    )

    return signature
  }

  dkgBackupKeys = async (): Promise<Buffer> => {
    this.logger.log('Please approve the request on your ledger device.')

    const { encryptedKeys } = await this.tryInstruction((app) => app.dkgBackupKeys())

    return encryptedKeys
  }

  dkgRestoreKeys = async (encryptedKeys: string): Promise<void> => {
    this.logger.log('Please approve the request on your ledger device.')

    await this.tryInstruction((app) => app.dkgRestoreKeys(encryptedKeys))
  }
}
