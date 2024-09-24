/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  createRootLogger,
  CurrencyUtils,
  Logger,
  RawTransaction,
  RawTransactionSerde,
  RpcClient,
  Transaction,
} from '@ironfish/sdk'
import { AccountImport } from '@ironfish/sdk/src/wallet/exporter'
import TransportNodeHid from '@ledgerhq/hw-transport-node-hid'
import { Errors, ux } from '@oclif/core'
import IronfishApp, {
  IronfishKeys,
  ResponseAddress,
  ResponseProofGenKey,
  ResponseSign,
  ResponseViewKey,
} from '@zondax/ledger-ironfish'
import * as ui from '../ui'
import { watchTransaction } from './transaction'

export class Ledger {
  app: IronfishApp | undefined
  logger: Logger
  PATH = "m/44'/1338'/0"

  constructor(logger?: Logger) {
    this.app = undefined
    this.logger = logger ? logger : createRootLogger()
  }

  connect = async () => {
    const transport = await TransportNodeHid.create(3000, 3000)

    if (transport.deviceModel) {
      this.logger.debug(`${transport.deviceModel.productName} found.`)
    }

    const app = new IronfishApp(transport)

    const appInfo = await app.appInfo()
    this.logger.debug(appInfo.appName ?? 'no app name')

    if (appInfo.appName !== 'Ironfish') {
      this.logger.debug(appInfo.appName ?? 'no app name')
      this.logger.debug(appInfo.returnCode.toString(16))
      this.logger.debug(appInfo.errorMessage.toString())

      // references:
      // https://github.com/LedgerHQ/ledger-live/blob/173bb3c84cc855f83ab8dc49362bc381afecc31e/libs/ledgerjs/packages/errors/src/index.ts#L263
      // https://github.com/Zondax/ledger-ironfish/blob/bf43a4b8d403d15138699ee3bb1a3d6dfdb428bc/docs/APDUSPEC.md?plain=1#L25
      if (appInfo.returnCode === 0x5515) {
        throw new Error('Please unlock your Ledger device.')
      }

      throw new Error('Please open the Iron Fish app on your ledger device.')
    }

    if (appInfo.appVersion) {
      this.logger.debug(`Ironfish App Version: ${appInfo.appVersion}`)
    }

    this.app = app

    return { app, PATH: this.PATH }
  }

  getPublicAddress = async () => {
    if (!this.app) {
      throw new Error('Connect to Ledger first')
    }

    const response: ResponseAddress = await this.app.retrieveKeys(
      this.PATH,
      IronfishKeys.PublicAddress,
      false,
    )

    if (!response.publicAddress) {
      this.logger.debug(`No public address returned.`)
      this.logger.debug(response.returnCode.toString())
      throw new Error(response.errorMessage)
    }

    return response.publicAddress.toString('hex')
  }

  importAccount = async () => {
    if (!this.app) {
      throw new Error('Connect to Ledger first')
    }

    const responseAddress: ResponseAddress = await this.app.retrieveKeys(
      this.PATH,
      IronfishKeys.PublicAddress,
      false,
    )

    if (!responseAddress.publicAddress) {
      this.logger.debug(`No public address returned.`)
      this.logger.debug(responseAddress.returnCode.toString())
      throw new Error(responseAddress.errorMessage)
    }

    this.logger.log('Please confirm the request on your ledger device.')

    const responseViewKey: ResponseViewKey = await this.app.retrieveKeys(
      this.PATH,
      IronfishKeys.ViewKey,
      true,
    )

    if (!responseViewKey.viewKey || !responseViewKey.ovk || !responseViewKey.ivk) {
      this.logger.debug(`No view key returned.`)
      this.logger.debug(responseViewKey.returnCode.toString())
      throw new Error(responseViewKey.errorMessage)
    }

    const responsePGK: ResponseProofGenKey = await this.app.retrieveKeys(
      this.PATH,
      IronfishKeys.ProofGenerationKey,
      false,
    )

    if (!responsePGK.ak || !responsePGK.nsk) {
      this.logger.debug(`No proof authorizing key returned.`)
      throw new Error(responsePGK.errorMessage)
    }

    const accountImport: AccountImport = {
      version: 4, // ACCOUNT_SCHEMA_VERSION as of 2024-05
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

    const response: ResponseSign = await this.app.sign(this.PATH, buffer)

    if (!response.signature) {
      this.logger.debug(`No signatures returned.`)
      this.logger.debug(response.returnCode.toString())
      throw new Error(response.errorMessage)
    }

    return response.signature
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
  const ledger = new Ledger(logger)
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

  await ui.confirmOrQuit('', confirm)

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
