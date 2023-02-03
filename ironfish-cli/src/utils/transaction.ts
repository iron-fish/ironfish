/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  Assert,
  createRootLogger,
  Logger,
  PromiseUtils,
  RpcClient,
  TimeUtils,
  TransactionStatus,
} from '@ironfish/sdk'
import { CliUx } from '@oclif/core'

export async function watchTransaction(options: {
  client: RpcClient
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

  let last = await options.client.getAccountTransaction({
    account: options.account,
    hash: options.hash,
    confirmations: options.confirmations,
  })

  const startTime = lastTime

  if (last.content.transaction == null) {
    logger.log(`Tried to watch tranaction ${options.hash} but it's missing.`)
    return
  }

  if (last.content.transaction.status === waitUntil) {
    logger.log(
      `Transaction ${last.content.transaction.hash} is ${last.content.transaction.status}`,
    )
    return
  }

  logger.log(`Watching transaction ${last.content.transaction.hash}`)

  CliUx.ux.action.start(`Current Status`)
  const span = TimeUtils.renderSpan(0, { hideMilliseconds: true })
  CliUx.ux.action.status = `${last.content.transaction.status} ${span}`

  // eslint-disable-next-line no-constant-condition
  while (true) {
    Assert.isNotNull(last.content.transaction)

    const response = await options.client.getAccountTransaction({
      account: options.account,
      hash: options.hash,
      confirmations: options.confirmations,
    })

    if (response.content.transaction == null) {
      CliUx.ux.action.stop(`Transaction ${options.hash} deleted while watching it.`)
      break
    }

    if (response.content.transaction.status === last.content.transaction.status) {
      const duration = Date.now() - lastTime
      const span = TimeUtils.renderSpan(duration, { hideMilliseconds: true })
      CliUx.ux.action.status = `${last.content.transaction.status} ${span}`
      await PromiseUtils.sleep(pollFrequencyMs)
      continue
    }

    const now = Date.now()
    const duration = now - lastTime
    lastTime = now

    CliUx.ux.action.stop(
      `${last.content.transaction.status} -> ${
        response.content.transaction.status
      }: ${TimeUtils.renderSpan(duration, { hideMilliseconds: true })}`,
    )

    last = response

    CliUx.ux.action.start(`Current Status`)
    const span = TimeUtils.renderSpan(0, { hideMilliseconds: true })
    CliUx.ux.action.status = `${response.content.transaction.status} ${span}`

    if (response.content.transaction.status === waitUntil) {
      const duration = now - startTime
      const span = TimeUtils.renderSpan(duration, { hideMilliseconds: true })
      CliUx.ux.action.stop(`done after ${span}`)
      break
    }
  }
}
