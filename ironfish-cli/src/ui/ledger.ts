/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { PromiseUtils } from '@ironfish/sdk'
import { ux } from '@oclif/core'
import {
  Ledger,
  LedgerAppNotOpen,
  LedgerClaNotSupportedError,
  LedgerConnectError,
  LedgerDeviceLockedError,
  LedgerGPAuthFailed,
  LedgerPortIsBusyError,
} from '../ledger'

export async function ledgerAction<TResult>(
  ledger: Ledger,
  handler: () => TResult | Promise<TResult>,
  action?: string,
): Promise<TResult> {
  const wasRunning = ux.action.running
  let statusAdded = false
  let actionAdded = false

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const result = await handler()
        ux.action.stop()
        return result
      } catch (e) {
        let status: string | undefined

        if (e instanceof LedgerConnectError) {
          status = 'Connect and unlock your Ledger'
        } else if (e instanceof LedgerAppNotOpen) {
          const appName = ledger.isMultisig ? 'Ironfish DKG' : 'Ironfish'
          status = `Unlock your Ledger and open the ${appName}`
        } else if (e instanceof LedgerDeviceLockedError) {
          status = 'Unlock your Ledger'
        } else if (e instanceof LedgerPortIsBusyError) {
          status = 'Ledger is busy, retrying'
        } else if (e instanceof LedgerGPAuthFailed) {
          status = 'Ledger handshake failed, retrying'
        } else if (e instanceof LedgerClaNotSupportedError) {
          const appName = ledger.isMultisig ? 'Ironfish DKG' : 'Ironfish'
          status = `Wrong Ledger app. Please open ${appName}`
        } else {
          throw e
        }

        // Always show our custom action
        if (action && !actionAdded) {
          ux.action.start(action)
          actionAdded = true
        }

        if (wasRunning || actionAdded) {
          // Only update the status if someone else is using the action
          ux.action.status = status
        } else {
          // Use the action if no one else is using it
          ux.action.start(status)
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
