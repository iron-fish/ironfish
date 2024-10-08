/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { UnsignedTransaction } from '@ironfish/sdk'
import {
  IronfishKeys,
  KeyResponse,
  ResponseDkgRound1,
  ResponseDkgRound2,
} from '@zondax/ledger-ironfish'
import { isResponseAddress, isResponseProofGenKey, isResponseViewKey, Ledger } from './ledger'

export class LedgerMultiSigner extends Ledger {
  constructor() {
    super(true)
  }

  dkgGetIdentity = async (index: number): Promise<Buffer> => {
    const response = await this.tryInstruction((app) => app.dkgGetIdentity(index, false))

    return response.identity
  }

  dkgRound1 = async (
    index: number,
    identities: string[],
    minSigners: number,
  ): Promise<ResponseDkgRound1> => {
    return this.tryInstruction((app) => app.dkgRound1(index, identities, minSigners))
  }

  dkgRound2 = async (
    index: number,
    round1PublicPackages: string[],
    round1SecretPackage: string,
  ): Promise<ResponseDkgRound2> => {
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
    const { hash } = await this.tryInstruction((app) => app.reviewTransaction(transaction))

    return hash
  }

  dkgGetCommitments = async (transaction: UnsignedTransaction): Promise<Buffer> => {
    const { commitments } = await this.tryInstruction(async (app) => {
      const { hash } = await app.reviewTransaction(transaction.serialize().toString('hex'))
      return app.dkgGetCommitments(hash.toString('hex'))
    })

    return commitments
  }

  dkgSign = async (
    transaction: UnsignedTransaction,
    frostSigningPackage: string,
  ): Promise<Buffer> => {
    const randomness = transaction.publicKeyRandomness()
    const { signature } = await this.tryInstruction(async (app) => {
      const { hash } = await app.reviewTransaction(transaction.serialize().toString('hex'))
      return app.dkgSign(randomness, frostSigningPackage, hash.toString('hex'))
    })

    return signature
  }

  dkgBackupKeys = async (): Promise<Buffer> => {
    const { encryptedKeys } = await this.tryInstruction((app) => app.dkgBackupKeys())

    return encryptedKeys
  }

  dkgRestoreKeys = async (encryptedKeys: string): Promise<void> => {
    await this.tryInstruction((app) => app.dkgRestoreKeys(encryptedKeys))
  }
}
