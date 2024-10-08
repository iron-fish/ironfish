/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '@ironfish/sdk'
import { StatusCodes, TransportStatusError } from '@ledgerhq/errors'
import TransportNodeHid from '@ledgerhq/hw-transport-node-hid'
import IronfishApp, {
  KeyResponse,
  ResponseAddress,
  ResponseProofGenKey,
  ResponseViewKey,
} from '@zondax/ledger-ironfish'
import { ResponseError, Transport } from '@zondax/ledger-js'

export const IronfishLedgerStatusCodes = {
  ...StatusCodes,
  COMMAND_NOT_ALLOWED: 0x6986,
}

export class Ledger {
  app: IronfishApp | undefined
  PATH = "m/44'/1338'/0"
  isMultisig: boolean
  isConnecting: boolean = false

  constructor(isMultisig: boolean) {
    this.app = undefined
    this.isMultisig = isMultisig
  }

  tryInstruction = async <T>(instruction: (app: IronfishApp) => Promise<T>) => {
    try {
      await this.connect()

      Assert.isNotUndefined(this.app, 'Unable to establish connection with Ledger device')

      const app = this.app

      // App info is a request to the dashboard CLA. The purpose of this it to
      // produce a Locked Device error and works if an app is open or closed.
      try {
        await app.appInfo()
      } catch (error) {
        if (
          error instanceof ResponseError &&
          error.message.includes('Attempt to read beyond buffer length') &&
          error.returnCode === IronfishLedgerStatusCodes.TECHNICAL_PROBLEM
        ) {
          // Catch this error and swollow it until the SDK fix merges to fix
          // this
        }
      }

      // This is an app specific request. This is useful because this throws
      // INS_NOT_SUPPORTED in the case that the app is locked which is useful to
      // know versus the device is locked.
      try {
        await app.getVersion()
      } catch (error) {
        if (
          error instanceof ResponseError &&
          error.returnCode === IronfishLedgerStatusCodes.INS_NOT_SUPPORTED
        ) {
          throw new LedgerAppLocked()
        }

        throw error
      }

      return await instruction(app)
    } catch (error: unknown) {
      if (LedgerPortIsBusyError.IsError(error)) {
        throw new LedgerPortIsBusyError()
      } else if (LedgerConnectError.IsError(error)) {
        throw new LedgerConnectError()
      }

      if (error instanceof TransportStatusError) {
        if (
          error.statusCode === IronfishLedgerStatusCodes.COMMAND_NOT_ALLOWED ||
          error.statusCode === IronfishLedgerStatusCodes.CONDITIONS_OF_USE_NOT_SATISFIED
        ) {
          throw new LedgerActionRejected()
        } else {
          throw new LedgerConnectError()
        }
      }

      if (error instanceof ResponseError) {
        if (error.returnCode === IronfishLedgerStatusCodes.LOCKED_DEVICE) {
          throw new LedgerDeviceLockedError()
        } else if (error.returnCode === IronfishLedgerStatusCodes.CLA_NOT_SUPPORTED) {
          throw new LedgerClaNotSupportedError()
        } else if (error.returnCode === IronfishLedgerStatusCodes.GP_AUTH_FAILED) {
          throw new LedgerGPAuthFailed()
        } else if (
          [
            IronfishLedgerStatusCodes.COMMAND_NOT_ALLOWED,
            IronfishLedgerStatusCodes.CONDITIONS_OF_USE_NOT_SATISFIED,
          ].includes(error.returnCode)
        ) {
          throw new LedgerActionRejected()
        } else if (
          [
            IronfishLedgerStatusCodes.INS_NOT_SUPPORTED,
            IronfishLedgerStatusCodes.TECHNICAL_PROBLEM,
            0xffff, // Unknown transport error
            0x6e01, // App not open
          ].includes(error.returnCode)
        ) {
          throw new LedgerAppNotOpen(
            `Unable to connect to Ironfish app on Ledger. Please check that the device is unlocked and the app is open.`,
          )
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

      const app = new IronfishApp(transport, this.isMultisig)

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

export class LedgerDeviceLockedError extends LedgerError {}
export class LedgerAppLocked extends LedgerError {}
export class LedgerGPAuthFailed extends LedgerError {}
export class LedgerClaNotSupportedError extends LedgerError {}
export class LedgerAppNotOpen extends LedgerError {}
export class LedgerActionRejected extends LedgerError {}
