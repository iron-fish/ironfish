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
} from '@ironfish/sdk'
import { CliUx } from '@oclif/core'

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

  let prevStatus = last?.content.transaction?.status ?? 'not found'
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
