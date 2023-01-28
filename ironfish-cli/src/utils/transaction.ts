/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  Assert,
  Logger,
  PromiseUtils,
  RpcClient,
  TimeUtils,
  TransactionStatus,
} from '@ironfish/sdk'
import { CliUx } from '@oclif/core'

export async function watchTransaction(
  client: RpcClient,
  logger: Logger,
  account: string | undefined,
  hash: string,
  confirmations?: number,
  waitUntil: TransactionStatus = TransactionStatus.CONFIRMED,
): Promise<void> {
  let last = await client.getAccountTransaction({ account, hash })
  let lastTime = Date.now()

  if (last.content.transaction == null) {
    logger.log(`Tried to watch tranaction ${hash} but it's missing.`)
    return
  }

  if (last.content.transaction.status === waitUntil) {
    logger.log(
      `Transaction ${last.content.transaction.hash} is ${last.content.transaction.status}`,
    )
    return
  }

  logger.log(`Watching transaction ${last.content.transaction.hash}`)

  CliUx.ux.action.start(`Watching`)
  CliUx.ux.action.status = last.content.transaction.status

  // eslint-disable-next-line no-constant-condition
  while (true) {
    Assert.isNotNull(last.content.transaction)

    const response = await client.getAccountTransaction({ account, hash, confirmations })

    if (response.content.transaction == null) {
      CliUx.ux.action.stop(`Transaction ${hash} deleted while watching it.`)
      return
    }

    if (response.content.transaction.status === last.content.transaction.status) {
      await PromiseUtils.sleep(2000)
      continue
    }

    const now = Date.now()
    const duration = now - lastTime
    lastTime = now

    CliUx.ux.action.stop(
      `${last.content.transaction.status} -> ${
        response.content.transaction.status
      }: ${TimeUtils.renderSpan(duration)}`,
    )

    last = response

    CliUx.ux.action.start(`Watching`)
    CliUx.ux.action.status = response.content.transaction.status

    if (response.content.transaction.status === waitUntil) {
      CliUx.ux.action.stop()
      return
    }
  }
}
