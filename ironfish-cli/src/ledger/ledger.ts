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
import { ResponseError, Transport } from '@zondax/ledger-js'

export class Ledger {
  app: IronfishApp | undefined
  logger: Logger
  PATH = "m/44'/1338'/0"
  isMultisig: boolean
  isConnecting: boolean = false

  constructor(isMultisig: boolean, logger?: Logger) {
    this.app = undefined
    this.logger = logger ? logger : createRootLogger()
    this.isMultisig = isMultisig
  }

  tryInstruction = async <T>(instruction: (app: IronfishApp) => Promise<T>) => {
    try {
      await this.refreshConnection()

      Assert.isNotUndefined(this.app, 'Unable to establish connection with Ledger device')
      return await instruction(this.app)
    } catch (error: unknown) {
      if (LedgerPortIsBusyError.IsError(error)) {
        throw new LedgerPortIsBusyError()
      } else if (LedgerConnectError.IsError(error)) {
        throw new LedgerConnectError()
      }

      if (error instanceof ResponseError) {
        if (error.returnCode === LedgerDeviceLockedError.returnCode) {
          throw new LedgerDeviceLockedError(error)
        } else if (error.returnCode === LedgerClaNotSupportedError.returnCode) {
          throw new LedgerClaNotSupportedError(error)
        } else if (error.returnCode === LedgerGPAuthFailed.returnCode) {
          throw new LedgerGPAuthFailed(error)
        } else if (LedgerAppNotOpen.returnCodes.includes(error.returnCode)) {
          throw new LedgerAppNotOpen(error)
        }

        throw new LedgerError(error.message)
      }

      throw error
    }
  }

  connect = async () => {
    if (this.app || this.isConnecting) {
      return
    }

    this.isConnecting = true

    let transport: Transport | undefined = undefined

    try {
      transport = await TransportNodeHid.create(2000, 2000)

      transport.on('disconnect', async () => {
        await transport?.close()
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
    } catch (e) {
      await transport?.close()
      throw e
    } finally {
      this.isConnecting = false
    }
  }

  close = () => {
    void this.app?.transport.close()
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

export class LedgerError extends Error {
  name = this.constructor.name
}

export class LedgerConnectError extends LedgerError {
  static IsError(error: unknown): error is Error {
    return (
      error instanceof Error &&
      'id' in error &&
      typeof error['id'] === 'string' &&
      error.id === 'ListenTimeout'
    )
  }
}

export class LedgerPortIsBusyError extends LedgerError {
  static IsError(error: unknown): error is Error {
    return error instanceof Error && error.message.includes('cannot open device with path')
  }
}

export class LedgerResponseError extends LedgerError {
  returnCode: number | null

  constructor(error?: ResponseError, message?: string) {
    super(message ?? error?.errorMessage ?? error?.message)
    this.returnCode = error?.returnCode ?? null
  }
}

export class LedgerGPAuthFailed extends LedgerResponseError {
  static returnCode = 0x6300
}

export class LedgerClaNotSupportedError extends LedgerResponseError {
  static returnCode = 0x6e00
}

export class LedgerDeviceLockedError extends LedgerResponseError {
  static returnCode = 0x5515
}

export class LedgerAppNotOpen extends LedgerResponseError {
  static returnCodes = [
    0x6d00, // Instruction not supported
    0xffff, // Unknown transport error
    0x6f00, // Technical error
    0x6e01, // App not open
  ]

  constructor(error: ResponseError) {
    super(
      error,
      `Unable to connect to Ironfish app on Ledger. Please check that the device is unlocked and the app is open.`,
    )
  }
}
