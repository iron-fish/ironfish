/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  CurrencyUtils,
  Logger,
  PromiseUtils,
  RawTransaction,
  RawTransactionSerde,
  RpcClient,
  Transaction,
} from '@ironfish/sdk'
import { Errors, ux } from '@oclif/core'
import {
  Ledger,
  LedgerActionRejected,
  LedgerAppNotOpen,
  LedgerClaNotSupportedError,
  LedgerConnectError,
  LedgerDeviceLockedError,
  LedgerExpertModeError,
  LedgerGPAuthFailed,
  LedgerInvalidDkgStatusError,
  LedgerPanicError,
  LedgerPortIsBusyError,
  LedgerSingleSigner,
} from '../ledger'
import * as ui from '../ui'
import { watchTransaction } from '../utils/transaction'

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

  if (!wasRunning) {
    ux.action.start(message)
  }

  let clearStatusTimer

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        clearStatusTimer = setTimeout(() => {
          if (approval) {
            ux.action.status = 'Approve on Ledger'
          } else {
            ux.action.status = undefined
          }
        }, ledger.connectTimeout + 500)

        const result = await action()
        ux.action.stop()
        return result
      } catch (e) {
        clearTimeout(clearStatusTimer)

        if (e instanceof LedgerDeviceLockedError) {
          // If an app is running and it's locked, trying to poll the device
          // will cause the Ledger device to hide the pin screen as the user
          // is trying to enter their pin. When we run into this error, we
          // cannot send any commands to the Ledger in the app's CLA.
          ux.action.stop('Ledger Locked')
          await confirmRetryAction(
            'Ledger Locked. Unlock and press enter to retry:',
            wasRunning,
          )
        } else if (e instanceof LedgerExpertModeError) {
          // Polling the device may prevent the user from navigating to the
          // expert mode screen in the app and enabling expert mode.
          ux.action.stop('Expert mode required to send custom assets')
          await confirmRetryAction('Enable expert mode and press enter to retry:', wasRunning)
        } else if (e instanceof LedgerActionRejected) {
          ux.action.stop('User Rejected Ledger Request!')
          await confirmRetryAction('Request rejected. Retry?', wasRunning)
        } else if (e instanceof LedgerInvalidDkgStatusError) {
          ux.action.stop('Ironfish DKG Ledger App does not have any multisig keys!')
          ux.stdout(
            'Use `wallet:multisig:ledger:restore` to restore an encrypted backup to your Ledger',
          )
          ux.exit(1)
        } else if (e instanceof LedgerConnectError) {
          ux.action.status = 'Connect and unlock your Ledger'
        } else if (e instanceof LedgerAppNotOpen) {
          const appName = ledger.isMultisig ? 'Ironfish DKG' : 'Ironfish'
          ux.action.status = `Open Ledger App ${appName}`
        } else if (e instanceof LedgerPanicError) {
          ux.action.status = 'Ledger App Crashed'
          ux.stdout('Ledger App Crashed! ⚠️')
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

        await PromiseUtils.sleep(1000)
        continue
      }
    }
  } finally {
    // Don't interrupt an existing status outside of ledgerAction()
    if (!wasRunning) {
      clearTimeout(clearStatusTimer)
      ux.action.stop()
    }
  }
}

async function confirmRetryAction(message: string, actionRunning: boolean): Promise<void> {
  const confirmed = await ui.confirmList(message, 'Retry')

  if (!confirmed) {
    ux.stdout('Operation aborted.')
    ux.exit(0)
  }

  if (!actionRunning) {
    ux.action.start(message)
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
  const ledgerApp = new LedgerSingleSigner()

  const publicKey = (await client.wallet.getAccountPublicKey({ account: from })).content
    .publicKey

  const ledgerPublicKey = await ledger({
    ledger: ledgerApp,
    message: 'Get Public Address',
    action: () => ledgerApp.getPublicAddress(),
  })

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

  ux.stdout('Please confirm the transaction on your Ledger device')

  const signature = await ledger({
    ledger: ledgerApp,
    message: 'Sign Transaction',
    approval: true,
    action: () => ledgerApp.sign(unsignedTransaction),
  })

  ux.stdout(`\nSignature: ${signature.toString('hex')}`)

  const addSignatureResponse = await client.wallet.addSignature({
    unsignedTransaction,
    signature: signature.toString('hex'),
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
