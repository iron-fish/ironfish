/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  createRootLogger,
  CurrencyUtils,
  Logger,
  PromiseUtils,
  RawTransaction,
  RpcClient,
  TimeUtils,
  TransactionStatus,
  UnsignedTransaction,
} from '@ironfish/sdk'
import { CliUx } from '@oclif/core'
import { ProgressBar } from '../types'

export class TransactionTimer {
  private logger: Logger
  private progressBar: ProgressBar | undefined
  private startTime: number | undefined
  private estimateInMs: number
  private timer: NodeJS.Timer | undefined

  constructor(spendPostTime: number, raw: RawTransaction, logger?: Logger) {
    this.logger = logger ?? createRootLogger()
    this.estimateInMs = Math.max(Math.ceil(spendPostTime * raw.spends.length), 1000)
  }

  displayEstimate() {
    this.logger.log(
      `Time to send: ${TimeUtils.renderSpan(this.estimateInMs, {
        hideMilliseconds: true,
      })}`,
    )
  }

  start() {
    this.progressBar = CliUx.ux.progress({
      format: '{title}: [{bar}] {percentage}% | {estimate}',
    }) as ProgressBar

    this.startTime = Date.now()

    this.progressBar.start(100, 0, {
      title: 'Sending the transaction',
      estimate: TimeUtils.renderSpan(this.estimateInMs, { hideMilliseconds: true }),
    })

    this.timer = setInterval(() => {
      if (!this.progressBar || !this.startTime) {
        return
      }
      const durationInMs = Date.now() - this.startTime
      const timeRemaining = this.estimateInMs - durationInMs
      const progress = Math.round((durationInMs / this.estimateInMs) * 100)

      this.progressBar.update(progress, {
        estimate: TimeUtils.renderSpan(timeRemaining, { hideMilliseconds: true }),
      })
    }, 1000)
  }

  end() {
    if (!this.progressBar || !this.startTime || !this.timer) {
      return
    }

    clearInterval(this.timer)
    this.progressBar.update(100)
    this.progressBar.stop()

    this.logger.log(
      `Sending took ${TimeUtils.renderSpan(Date.now() - this.startTime, {
        hideMilliseconds: true,
      })}`,
    )
  }
}

export async function renderUnsignedTransactionDetails(
  client: RpcClient,
  unsignedTransaction: UnsignedTransaction,
  account?: string,
  logger?: Logger,
): Promise<void> {
  logger = logger ?? createRootLogger()

  if (unsignedTransaction.mints.length > 0) {
    logger.log('')
    logger.log('==================')
    logger.log('Transaction Mints:')
    logger.log('==================')

    for (const [i, mint] of unsignedTransaction.mints.entries()) {
      if (i !== 0) {
        logger.log('------------------')
      }
      logger.log('')

      logger.log(`Asset ID:      ${mint.asset.id().toString('hex')}`)
      logger.log(`Name:          ${mint.asset.name().toString('utf8')}`)
      logger.log(`Amount:        ${CurrencyUtils.renderIron(mint.value, false)}`)

      if (mint.transferOwnershipTo) {
        logger.log(
          `Ownership of logger asset will be transferred to ${mint.transferOwnershipTo.toString(
            'hex',
          )}. The current account will no longer have any permission to mint or modify logger asset. logger cannot be undone.`,
        )
      }
      logger.log('')
    }
  }

  if (unsignedTransaction.burns.length > 0) {
    logger.log('')
    logger.log('==================')
    logger.log('Transaction Burns:')
    logger.log('==================')

    for (const [i, burn] of unsignedTransaction.burns.entries()) {
      if (i !== 0) {
        logger.log('------------------')
      }
      logger.log('')

      logger.log(`Asset ID:      ${burn.assetId.toString('hex')}`)
      logger.log(`Amount:        ${CurrencyUtils.renderIron(burn.value, false)}`)
      logger.log('')
    }
  }

  if (unsignedTransaction.notes.length > 0) {
    const response = await client.wallet.getUnsignedTransactionNotes({
      account,
      unsignedTransaction: unsignedTransaction.serialize().toString('hex'),
    })

    logger.log('')
    logger.log('==================')
    logger.log('Notes sent:')
    logger.log('==================')

    for (const [i, note] of response.content.sentNotes.entries()) {
      // Skip logger since we'll re-render for received notes
      if (note.owner === note.sender) {
        continue
      }

      if (i !== 0) {
        logger.log('------------------')
      }
      logger.log('')

      logger.log(`Amount:        ${CurrencyUtils.renderIron(note.value, true, note.assetId)}`)
      logger.log(`Memo:          ${note.memo}`)
      logger.log(`Recipient:     ${note.owner}`)
      logger.log(`Sender:        ${note.sender}`)
      logger.log('')
    }

    logger.log('')
    logger.log('==================')
    logger.log('Notes received:')
    logger.log('==================')

    for (const [i, note] of response.content.receivedNotes.entries()) {
      if (i !== 0) {
        logger.log('------------------')
      }
      logger.log('')

      logger.log(`Amount:        ${CurrencyUtils.renderIron(note.value, true, note.assetId)}`)
      logger.log(`Memo:          ${note.memo}`)
      logger.log(`Recipient:     ${note.owner}`)
      logger.log(`Sender:        ${note.sender}`)
      logger.log('')
    }

    if (!response.content.sentNotes.length && !response.content.receivedNotes.length) {
      logger.log('')
      logger.log('------------------')
      logger.log('Account unable to decrypt any notes in this transaction')
      logger.log('------------------')
    }
  }

  logger.log('')
}

export function displayTransactionSummary(
  transaction: RawTransaction,
  assetId: string,
  amount: bigint,
  from: string,
  to: string,
  memo: string,
  logger?: Logger,
): void {
  logger = logger ?? createRootLogger()

  const amountString = CurrencyUtils.renderIron(amount, true, assetId)
  const feeString = CurrencyUtils.renderIron(transaction.fee, true)

  const summary = `\
\nTRANSACTION SUMMARY:
From                 ${from}
To                   ${to}
Amount               ${amountString}
Fee                  ${feeString}
Memo                 ${memo}
Outputs              ${transaction.outputs.length}
Spends               ${transaction.spends.length}
Expiration           ${transaction.expiration ? transaction.expiration.toString() : ''}
`
  logger.log(summary)
}

export async function watchTransaction(options: {
  client: Pick<RpcClient, 'wallet'>
  hash: string
  account?: string
  confirmations?: number
  waitUntil?: TransactionStatus
  pollFrequencyMs?: number
  logger?: Logger
}): Promise<void> {
  const logger = options.logger ?? createRootLogger()
  const waitUntil = options.waitUntil ?? TransactionStatus.CONFIRMED
  const pollFrequencyMs = options.pollFrequencyMs ?? 10000

  let lastTime = Date.now()

  let last = await options.client.wallet.getAccountTransaction({
    account: options.account,
    hash: options.hash,
    confirmations: options.confirmations,
  })

  const startTime = lastTime

  let prevStatus: TransactionStatus | 'not found' =
    last?.content.transaction?.status ?? 'not found'
  let currentStatus = prevStatus

  // If the transaction is already in the desired state, return
  if (currentStatus === waitUntil) {
    logger.log(`Transaction ${options.hash} is ${waitUntil}`)
    return
  }

  logger.log(`Watching transaction ${options.hash}`)

  CliUx.ux.action.start(`Current Status`)
  const span = TimeUtils.renderSpan(0, { hideMilliseconds: true })
  CliUx.ux.action.status = `${currentStatus} ${span}`

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const response = await options.client.wallet.getAccountTransaction({
      account: options.account,
      hash: options.hash,
      confirmations: options.confirmations,
    })

    currentStatus = response?.content.transaction?.status ?? 'not found'

    if (prevStatus !== 'not found' && currentStatus === 'not found') {
      CliUx.ux.action.stop(`Transaction ${options.hash} deleted while watching it.`)
      break
    }

    if (currentStatus === prevStatus) {
      const duration = Date.now() - lastTime
      const span = TimeUtils.renderSpan(duration, { hideMilliseconds: true })
      CliUx.ux.action.status = `${currentStatus} ${span}`
      await PromiseUtils.sleep(pollFrequencyMs)
      continue
    }

    // State has changed
    const now = Date.now()
    const duration = now - lastTime
    lastTime = now

    CliUx.ux.action.stop(
      `${prevStatus} -> ${currentStatus}: ${TimeUtils.renderSpan(duration, {
        hideMilliseconds: true,
      })}`,
    )

    last = response
    prevStatus = currentStatus

    CliUx.ux.action.start(`Current Status`)
    const span = TimeUtils.renderSpan(0, { hideMilliseconds: true })
    CliUx.ux.action.status = `${currentStatus} ${span}`

    if (currentStatus === waitUntil) {
      const duration = now - startTime
      const span = TimeUtils.renderSpan(duration, { hideMilliseconds: true })
      CliUx.ux.action.stop(`done after ${span}`)
      break
    }
  }
}
