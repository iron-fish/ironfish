/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert, createRootLogger, Logger } from '@ironfish/sdk'
import TransportNodeHid from '@ledgerhq/hw-transport-node-hid'
import IronfishApp, {
  KeyResponse,
  ResponseAddress,
  ResponseProofGenKey,
  ResponseViewKey,
} from '@zondax/ledger-ironfish'
import { ResponseError } from '@zondax/ledger-js'

export class Ledger {
  app: IronfishApp | undefined
  logger: Logger
  PATH = "m/44'/1338'/0"
  isMultisig: boolean

  constructor(isMultisig: boolean, logger?: Logger) {
    this.app = undefined
    this.logger = logger ? logger : createRootLogger()
    this.isMultisig = isMultisig
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

    const app = new IronfishApp(transport, this.isMultisig)

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

export function isResponseAddress(response: KeyResponse): response is ResponseAddress {
  return 'publicAddress' in response
}

export function isResponseViewKey(response: KeyResponse): response is ResponseViewKey {
  return 'viewKey' in response
}

export function isResponseProofGenKey(response: KeyResponse): response is ResponseProofGenKey {
  return 'ak' in response && 'nsk' in response
}

export function isResponseError(error: unknown): error is ResponseError {
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
