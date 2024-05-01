/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert, createRootLogger, Logger } from '@ironfish/sdk'
import { AccountImport } from '@ironfish/sdk/src/wallet/exporter'
import TransportNodeHid from '@ledgerhq/hw-transport-node-hid'
import IronfishApp, {
  IronfishKeys,
  ResponseAddress,
  ResponseProofGenKey,
  ResponseSign,
  ResponseViewKey,
} from '@zondax/ledger-ironfish'

export class Ledger {
  app: IronfishApp | undefined
  logger: Logger
  PATH = "m/44'/1338'/0"

  constructor(logger?: Logger) {
    this.app = undefined
    this.logger = logger ? logger : createRootLogger()
  }

  publicAddress = async () => {
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

  connect = async () => {
    const transport = await TransportNodeHid.create(3000, 3000)

    const app = new IronfishApp(transport)

    const appInfo = await app.appInfo()
    this.logger.debug(appInfo.appName ?? 'no app name')

    if (appInfo.appName !== 'Ironfish') {
      this.logger.debug(appInfo.appName ?? 'no app name')
      this.logger.debug(appInfo.returnCode.toString())
      this.logger.debug(appInfo.errorMessage.toString())
      throw new Error('Please open the Iron Fish app on your ledger device')
    }

    if (appInfo.appVersion) {
      this.logger.debug(`Ironfish App Version: ${appInfo.appVersion}`)
    }

    this.app = app

    return { app, PATH: this.PATH }
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

    if (!response.signatures) {
      this.logger.debug(`No signatures returned.`)
      this.logger.debug(response.returnCode.toString())
      throw new Error(response.errorMessage)
    }

    Assert.isEqual(response.signatures.length, 1)

    return response.signatures[0]
  }
}
