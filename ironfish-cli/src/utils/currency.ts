/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Asset } from '@ironfish/rust-nodejs'
import { Assert, CurrencyUtils, RpcClient } from '@ironfish/sdk'
import { CliUx } from '@oclif/core'
import {createRootLogger, Logger} from '@ironfish/sdk'


export async function promptCurrency(options: {
  client: RpcClient
  text: string
  required: true
  minimum?: bigint
  balance?: {
    account?: string
    assetId?: string
    confirmations?: number
  }
  logger?: Logger
}): Promise<bigint>

export async function promptCurrency(options: {
  client: RpcClient
  text: string
  required?: boolean
  minimum?: bigint
  balance?: {
    account?: string
    assetId?: string
    confirmations?: number
  }
  logger?: Logger
}): Promise<bigint | null> {
  let text = options.text
  const logger = options.logger ?? createRootLogger()
  if (options.balance) {
    const balance = await options.client.getAccountBalance({
      assetId: options.balance.assetId ?? Asset.nativeId().toString('hex'),
      confirmations: options.balance.confirmations,
    })

    text += ` (balance ${CurrencyUtils.renderIron(balance.content.confirmed)})`
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const input = await CliUx.ux.prompt(text, {
      required: options.required,
    })

    if (!input) {
      return null
    }

    const [amount, error] = CurrencyUtils.decodeTry(input)

    if (error) {
      throw error
    }

    Assert.isNotNull(amount)
    if (options.minimum != null && amount < options.minimum) {
      logger.log("Please enter an amount greater than 0")
      continue
    }

    return amount
  }
}
