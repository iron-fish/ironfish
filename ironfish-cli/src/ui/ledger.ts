/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { PromiseUtils } from '@ironfish/sdk'
import { ux } from '@oclif/core'
import inquirer from 'inquirer'
import {
  Ledger,
  LedgerAppLocked,
  LedgerAppNotOpen,
  LedgerClaNotSupportedError,
  LedgerConnectError,
  LedgerDeviceLockedError,
  LedgerGPAuthFailed,
  LedgerPortIsBusyError,
} from '../ledger'

export async function ledger<TResult>({
  ledger,
  action,
  message = 'Ledger',
  approval,
}: {
  ledger: Ledger
  action: () => TResult | Promise<TResult>
  message?: string
  approval?: boolean
}): Promise<TResult> {
  const wasRunning = ux.action.running
  let statusAdded = false

  if (approval) {
    message = `Approve ${message}`
  }

  if (!wasRunning) {
    ux.action.start(message)
  }

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const result = await action()
        ux.action.stop()
        return result
      } catch (e) {
        if (e instanceof LedgerAppLocked) {
          // If an app is running and it's locked, trying to poll the device
          // will cause the Ledger device to hide the pin screen as the user
          // is trying to enter their pin. When we run into this error, we
          // cannot send any commands to the Ledger in the app's CLA.
          ux.action.stop('Ledger App Locked')

          await inquirer.prompt<{ retry: boolean }>([
            {
              name: 'retry',
              message: `Ledger App Locked. Unlock and press enter to retry:`,
              type: 'list',
              choices: [
                {
                  name: `Retry`,
                  value: true,
                  default: true,
                },
              ],
            },
          ])

          if (!wasRunning) {
            ux.action.start(message)
          }
        } else if (e instanceof LedgerConnectError) {
          ux.action.status = 'Connect and unlock your Ledger'
        } else if (e instanceof LedgerAppNotOpen) {
          const appName = ledger.isMultisig ? 'Ironfish DKG' : 'Ironfish'
          ux.action.status = `Open Ledger App ${appName}`
        } else if (e instanceof LedgerDeviceLockedError) {
          ux.action.status = 'Unlock Ledger'
        } else if (e instanceof LedgerPortIsBusyError) {
          ux.action.status = 'Ledger is busy, retrying'
        } else if (e instanceof LedgerGPAuthFailed) {
          ux.action.status = 'Ledger handshake failed, retrying'
        } else if (e instanceof LedgerClaNotSupportedError) {
          const appName = ledger.isMultisig ? 'Ironfish DKG' : 'Ironfish'
          ux.action.status = `Wrong Ledger app. Please open ${appName}`
        } else {
          throw e
        }

        statusAdded = true
        await PromiseUtils.sleep(1000)
        continue
      }
    }
  } finally {
    // Don't interrupt an existing status outside of ledgerAction()
    if (!wasRunning && statusAdded) {
      ux.action.stop()
    }
  }
}
