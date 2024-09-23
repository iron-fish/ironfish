/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ACCOUNT_SCHEMA_VERSION, AccountImport, createRootLogger, Logger } from '@ironfish/sdk'
import TransportNodeHid from '@ledgerhq/hw-transport-node-hid'
import IronfishApp, {
  IronfishKeys,
  KeyResponse,
  ResponseAddress,
  ResponseDkgRound1,
  ResponseDkgRound2,
  ResponseIdentity,
  ResponseProofGenKey,
  ResponseSign,
  ResponseViewKey,
} from '@zondax/ledger-ironfish'
import { ResponseError } from '@zondax/ledger-js'

export class Ledger {
  app: IronfishApp | undefined
  logger: Logger
  PATH = "m/44'/1338'/0"

  constructor(logger?: Logger) {
    this.app = undefined
    this.logger = logger ? logger : createRootLogger()
  }

  tryInstruction = async <T>(promise: Promise<T>) => {
    try {
      return await promise
    } catch (error: unknown) {
      if (isResponseError(error)) {
        this.logger.debug(`Ledger ResponseError returnCode: ${error.returnCode.toString(16)}`)
        if (error.returnCode === LedgerDeviceLockedError.returnCode) {
          throw new LedgerDeviceLockedError('Please unlock your Ledger device.')
        } else if (error.returnCode === LedgerAppNotOpenError.returnCode) {
          throw new LedgerAppNotOpenError(
            'Please open the Iron Fish app on your Ledger device.',
          )
        }

        throw new LedgerError(error.errorMessage)
      }

      throw error
    }
  }

  connect = async (dkg = false) => {
    const transport = await TransportNodeHid.create(3000, 3000)

    if (transport.deviceModel) {
      this.logger.debug(`${transport.deviceModel.productName} found.`)
    }

    const app = new IronfishApp(transport, dkg)

    // TODO: remove this condition if appInfo is available in the DKG app
    if (!dkg) {
      const appInfo = await this.tryInstruction(app.appInfo())

      this.logger.debug(appInfo.appName ?? 'no app name')

      if (appInfo.appName !== 'Ironfish') {
        this.logger.debug(appInfo.appName ?? 'no app name')
        throw new Error('Please open the Iron Fish app on your ledger device.')
      }

      if (appInfo.appVersion) {
        this.logger.debug(`Ironfish App Version: ${appInfo.appVersion}`)
      }
    }

    this.app = app

    return { app, PATH: this.PATH }
  }

  getPublicAddress = async () => {
    if (!this.app) {
      throw new Error('Connect to Ledger first')
    }

    const response = await this.tryInstruction(
      this.app.retrieveKeys(this.PATH, IronfishKeys.PublicAddress, false),
    )

    if (!isResponseAddress(response)) {
      throw new Error(`No public address returned`)
    } else {
      return response.publicAddress.toString('hex')
    }
  }

  importAccount = async (): Promise<AccountImport> => {
    if (!this.app) {
      throw new Error('Connect to Ledger first')
    }

    const responseAddress: KeyResponse = await this.tryInstruction(
      this.app.retrieveKeys(this.PATH, IronfishKeys.PublicAddress, false),
    )

    if (!isResponseAddress(responseAddress)) {
      throw new Error(`No public address returned.`)
    }

    const responseViewKey = await this.tryInstruction(
      this.app.retrieveKeys(this.PATH, IronfishKeys.ViewKey, true),
    )

    if (!isResponseViewKey(responseViewKey)) {
      throw new Error(`No view key returned.`)
    }

    const responsePGK: KeyResponse = await this.tryInstruction(
      this.app.retrieveKeys(this.PATH, IronfishKeys.ProofGenerationKey, false),
    )

    if (!isResponseProofGenKey(responsePGK)) {
      throw new Error(`No proof authorizing key returned.`)
    }

    const accountImport: AccountImport = {
      version: ACCOUNT_SCHEMA_VERSION,
      name: 'ledger',
      viewKey: responseViewKey.viewKey.toString('hex'),
      incomingViewKey: responseViewKey.ivk.toString('hex'),
      outgoingViewKey: responseViewKey.ovk.toString('hex'),
      publicAddress: responseAddress.publicAddress.toString('hex'),
      proofAuthorizingKey: responsePGK.nsk.toString('hex'),
      spendingKey: null,
      createdAt: null,
    }

    return accountImport
  }

  sign = async (message: string): Promise<Buffer> => {
    if (!this.app) {
      throw new Error('Connect to Ledger first')
    }

    this.logger.log('Please confirm the request on your ledger device.')

    const buffer = Buffer.from(message, 'hex')

    // max size of a transaction is 16kb
    if (buffer.length > 16 * 1024) {
      throw new Error('Transaction size is too large, must be less than 16kb.')
    }

    const response: ResponseSign = await this.tryInstruction(this.app.sign(this.PATH, buffer))

    return response.signature
  }

  dkgGetIdentity = async (index: number): Promise<Buffer> => {
    if (!this.app) {
      throw new Error('Connect to Ledger first')
    }

    this.logger.log('Please approve the request on your ledger device.')

    const response: ResponseIdentity = await this.tryInstruction(this.app.dkgGetIdentity(index))

    return response.identity
  }

  dkgRound1 = async (
    index: number,
    identities: string[],
    minSigners: number,
  ): Promise<ResponseDkgRound1> => {
    if (!this.app) {
      throw new Error('Connect to Ledger first')
    }

    this.logger.log('Please approve the request on your ledger device.')

    return this.tryInstruction(this.app.dkgRound1(index, identities, minSigners))
  }

  dkgRound2 = async (
    index: number,
    round1PublicPackages: string[],
    round1SecretPackage: string,
  ): Promise<ResponseDkgRound2> => {
    if (!this.app) {
      throw new Error('Connect to Ledger first')
    }

    this.logger.log('Please approve the request on your ledger device.')

    return this.tryInstruction(
      this.app.dkgRound2(index, round1PublicPackages, round1SecretPackage),
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
    if (!this.app) {
      throw new Error('Connect to Ledger first')
    }

    this.logger.log('Please approve the request on your ledger device.')

    return this.tryInstruction(
      this.app.dkgRound3Min(
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
    if (!this.app) {
      throw new Error('Connect to Ledger first')
    }

    const responseAddress: KeyResponse = await this.tryInstruction(
      this.app.dkgRetrieveKeys(IronfishKeys.PublicAddress),
    )

    if (!isResponseAddress(responseAddress)) {
      throw new Error(`No public address returned.`)
    }

    const responseViewKey = await this.tryInstruction(
      this.app.dkgRetrieveKeys(IronfishKeys.ViewKey),
    )

    if (!isResponseViewKey(responseViewKey)) {
      throw new Error(`No view key returned.`)
    }

    const responsePGK: KeyResponse = await this.tryInstruction(
      this.app.dkgRetrieveKeys(IronfishKeys.ProofGenerationKey),
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
    if (!this.app) {
      throw new Error('Connect to Ledger first')
    }

    const response = await this.tryInstruction(this.app.dkgGetPublicPackage())

    return response.publicPackage
  }

  reviewTransaction = async (transaction: string): Promise<Buffer> => {
    if (!this.app) {
      throw new Error('Connect to Ledger first')
    }

    this.logger.info(
      'Please review and approve the outputs of this transaction on your ledger device.',
    )

    const { hash } = await this.tryInstruction(this.app.reviewTransaction(transaction))

    return hash
  }

  dkgGetCommitments = async (transactionHash: string): Promise<Buffer> => {
    if (!this.app) {
      throw new Error('Connect to Ledger first')
    }

    const { commitments } = await this.tryInstruction(
      this.app.dkgGetCommitments(transactionHash),
    )

    return commitments
  }

  dkgSign = async (
    randomness: string,
    frostSigningPackage: string,
    transactionHash: string,
  ): Promise<Buffer> => {
    if (!this.app) {
      throw new Error('Connect to Ledger first')
    }

    const { signature } = await this.tryInstruction(
      this.app.dkgSign(randomness, frostSigningPackage, transactionHash),
    )

    return signature
  }

  dkgBackupKeys = async (): Promise<Buffer> => {
    if (!this.app) {
      throw new Error('Connect to Ledger first')
    }

    this.logger.log('Please approve the request on your ledger device.')

    const { encryptedKeys } = await this.tryInstruction(this.app.dkgBackupKeys())

    return encryptedKeys
  }

  dkgRestoreKeys = async (encryptedKeys: string): Promise<void> => {
    if (!this.app) {
      throw new Error('Connect to Ledger first')
    }

    this.logger.log('Please approve the request on your ledger device.')

    await this.tryInstruction(this.app.dkgRestoreKeys(encryptedKeys))
  }
}

function isResponseAddress(response: KeyResponse): response is ResponseAddress {
  return 'publicAddress' in response
}

function isResponseViewKey(response: KeyResponse): response is ResponseViewKey {
  return 'viewKey' in response
}

function isResponseProofGenKey(response: KeyResponse): response is ResponseProofGenKey {
  return 'ak' in response
}

function isResponseError(error: unknown): error is ResponseError {
  return 'errorMessage' in (error as object) && 'returnCode' in (error as object)
}

export class LedgerError extends Error {
  name = this.constructor.name
}

export class LedgerDeviceLockedError extends LedgerError {
  static returnCode = 0x5515
}

export class LedgerAppNotOpenError extends LedgerError {
  static returnCode = 0x6f00
}
