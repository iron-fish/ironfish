/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Asset } from '@ironfish/rust-nodejs'
import { CurrencyUtils, RpcClient } from '@ironfish/sdk'
import { CliUx } from '@oclif/core'

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
}): Promise<bigint | null> {
  let text = options.text

  if (options.balance) {
    const balance = await options.client.getAccountBalance({
      assetId: options.balance.assetId ?? Asset.nativeId().toString('hex'),
      confirmations: options.balance.confirmations,
    })

    text += ` (balance ${CurrencyUtils.renderIron(balance.content.available)})`
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const input = await CliUx.ux.prompt(text, {
      required: options.required,
    })

    if (!input) {
      return null
    }

    const amount = CurrencyUtils.decodeIron(input)

    if (options.minimum != null && amount < options.minimum) {
      continue
    }

    return amount
  }
}
