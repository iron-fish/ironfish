/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  ACCOUNT_SCHEMA_VERSION,
  AccountImport,
  Assert,
  createRootLogger,
  CurrencyUtils,
  Logger,
  RawTransaction,
  RawTransactionSerde,
  RpcClient,
  Transaction,
} from '@ironfish/sdk'
import TransportNodeHid from '@ledgerhq/hw-transport-node-hid'
import { Errors, ux } from '@oclif/core'
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
import * as ui from '../ui'
import { watchTransaction } from './transaction'

class LedgerBase {
  app: IronfishApp | undefined
  logger: Logger
  PATH = "m/44'/1338'/0"
  isDkg: boolean

  constructor(isDkg: boolean, logger?: Logger) {
    this.app = undefined
    this.logger = logger ? logger : createRootLogger()
    this.isDkg = isDkg
  }

  tryInstruction = async <T>(instruction: (app: IronfishApp) => Promise<T>) => {
    await this.refreshConnection()
    Assert.isNotUndefined(this.app, 'Unable to establish connection with Ledger device')

    try {
      return await instruction(this.app)
    } catch (error: unknown) {
      if (isResponseError(error)) {
        this.logger.debug(`Ledger ResponseError returnCode: ${error.returnCode.toString(16)}`)
        if (error.returnCode === LedgerDeviceLockedError.returnCode) {
          throw new LedgerDeviceLockedError('Please unlock your Ledger device.')
        } else if (LedgerAppUnavailableError.returnCodes.includes(error.returnCode)) {
          throw new LedgerAppUnavailableError()
        }

        throw new LedgerError(error.errorMessage)
      }

      throw error
    }
  }

  connect = async () => {
    const transport = await TransportNodeHid.create(3000)

    transport.on('disconnect', async () => {
      await transport.close()
      this.app = undefined
    })

    if (transport.deviceModel) {
      this.logger.debug(`${transport.deviceModel.productName} found.`)
    }

    const app = new IronfishApp(transport, this.isDkg)

    // If the app isn't open or the device is locked, this will throw an error.
    await app.getVersion()

    this.app = app

    return { app, PATH: this.PATH }
  }

  protected refreshConnection = async () => {
    if (!this.app) {
      await this.connect()
    }
  }
}

export class LedgerDkg extends LedgerBase {
  constructor(logger?: Logger) {
    super(true, logger)
  }

  dkgGetIdentity = async (index: number): Promise<Buffer> => {
    this.logger.log('Retrieving identity from ledger device.')

    const response: ResponseIdentity = await this.tryInstruction((app) =>
      app.dkgGetIdentity(index, false),
    )

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

export class LedgerSingleSigner extends LedgerBase {
  constructor(logger?: Logger) {
    super(false, logger)
  }

  getPublicAddress = async () => {
    const response: KeyResponse = await this.tryInstruction((app) =>
      app.retrieveKeys(this.PATH, IronfishKeys.PublicAddress, false),
    )

    if (!isResponseAddress(response)) {
      throw new Error(`No public address returned.`)
    }

    return response.publicAddress.toString('hex')
  }

  importAccount = async () => {
    const publicAddress = await this.getPublicAddress()

    this.logger.log('Please confirm the request on your ledger device.')

    const responseViewKey: KeyResponse = await this.tryInstruction((app) =>
      app.retrieveKeys(this.PATH, IronfishKeys.ViewKey, true),
    )

    if (!isResponseViewKey(responseViewKey)) {
      throw new Error(`No view key returned.`)
    }

    const responsePGK: KeyResponse = await this.tryInstruction((app) =>
      app.retrieveKeys(this.PATH, IronfishKeys.ProofGenerationKey, false),
    )

    if (!isResponseProofGenKey(responsePGK)) {
      throw new Error(`No proof authorizing key returned.`)
    }

    const accountImport: AccountImport = {
      version: ACCOUNT_SCHEMA_VERSION,
      name: 'ledger',
      publicAddress,
      viewKey: responseViewKey.viewKey.toString('hex'),
      incomingViewKey: responseViewKey.ivk.toString('hex'),
      outgoingViewKey: responseViewKey.ovk.toString('hex'),
      proofAuthorizingKey: responsePGK.nsk.toString('hex'),
      spendingKey: null,
      createdAt: null,
    }

    return accountImport
  }

  sign = async (message: string): Promise<Buffer> => {
    const buffer = Buffer.from(message, 'hex')

    // max size of a transaction is 16kb
    if (buffer.length > 16 * 1024) {
      throw new Error('Transaction size is too large, must be less than 16kb.')
    }

    const response: ResponseSign = await this.tryInstruction((app) =>
      app.sign(this.PATH, buffer),
    )

    return response.signature
  }
}

function isResponseAddress(response: KeyResponse): response is ResponseAddress {
  return 'publicAddress' in response
}

function isResponseViewKey(response: KeyResponse): response is ResponseViewKey {
  return 'viewKey' in response
}

function isResponseProofGenKey(response: KeyResponse): response is ResponseProofGenKey {
  return 'ak' in response && 'nsk' in response
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

export class LedgerAppUnavailableError extends LedgerError {
  static returnCodes = [
    0x6d00, // Instruction not supported
    0xffff, // Unknown transport error
    0x6f00, // Technical error
  ]

  constructor() {
    super(
      `Unable to connect to Ironfish app on Ledger. Please check that the device is unlocked and the app is open.`,
    )
  }
}

export async function sendTransactionWithLedger(
  client: RpcClient,
  raw: RawTransaction,
  from: string | undefined,
  watch: boolean,
  confirm: boolean,
  logger?: Logger,
): Promise<void> {
  const ledger = new LedgerSingleSigner(logger)
  try {
    await ledger.connect()
  } catch (e) {
    if (e instanceof Error) {
      Errors.error(e.message)
    } else {
      throw e
    }
  }

  const publicKey = (await client.wallet.getAccountPublicKey({ account: from })).content
    .publicKey

  const ledgerPublicKey = await ledger.getPublicAddress()

  if (publicKey !== ledgerPublicKey) {
    Errors.error(
      `The public key on the ledger device does not match the public key of the account '${from}'`,
    )
  }

  const buildTransactionResponse = await client.wallet.buildTransaction({
    account: from,
    rawTransaction: RawTransactionSerde.serialize(raw).toString('hex'),
  })

  const unsignedTransaction = buildTransactionResponse.content.unsignedTransaction

  const signature = (await ledger.sign(unsignedTransaction)).toString('hex')

  ux.stdout(`\nSignature: ${signature}`)

  const addSignatureResponse = await client.wallet.addSignature({
    unsignedTransaction,
    signature,
  })

  const signedTransaction = addSignatureResponse.content.transaction
  const bytes = Buffer.from(signedTransaction, 'hex')

  const transaction = new Transaction(bytes)

  ux.stdout(`\nSigned Transaction: ${signedTransaction}`)
  ux.stdout(`\nHash: ${transaction.hash().toString('hex')}`)
  ux.stdout(`Fee: ${CurrencyUtils.render(transaction.fee(), true)}`)

  await ui.confirmOrQuit('Would you like to broadcast this transaction?', confirm)

  const addTransactionResponse = await client.wallet.addTransaction({
    transaction: signedTransaction,
    broadcast: true,
  })

  if (addTransactionResponse.content.accepted === false) {
    Errors.error(
      `Transaction '${transaction.hash().toString('hex')}' was not accepted into the mempool`,
    )
  }

  if (watch) {
    ux.stdout('')

    await watchTransaction({
      client,
      logger,
      account: from,
      hash: transaction.hash().toString('hex'),
    })
  }
}
