/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Asset } from '@ironfish/rust-nodejs'
import { Assert, CurrencyUtils, Logger, RpcAsset, RpcClient } from '@ironfish/sdk'
import { CliUx } from '@oclif/core'

/**
 * This prompts the user to enter an amount of currency in the major
 * denomination and returns the value in the minor denomination
 */
export async function promptCurrency(options: {
  client: Pick<RpcClient, 'wallet'>
  text: string
  logger: Logger
  required: true
  minimum?: bigint
  asset?: RpcAsset
  balance?: {
    account?: string
    confirmations?: number
  }
}): Promise<bigint>

export async function promptCurrency(options: {
  client: Pick<RpcClient, 'wallet'>
  text: string
  logger: Logger
  required?: boolean
  minimum?: bigint
  asset?: RpcAsset
  balance?: {
    account?: string
    confirmations?: number
  }
}): Promise<bigint | null> {
  let text = options.text

  if (options.balance) {
    const balance = await options.client.wallet.getAccountBalance({
      account: options.balance.account,
      assetId: options.asset?.id ?? Asset.nativeId().toString('hex'),
      confirmations: options.balance.confirmations,
    })

    const renderedAvailable = CurrencyUtils.render(
      balance.content.available,
      false,
      options.asset?.id,
      options.asset?.verification,
    )
    text += ` (balance ${renderedAvailable})`
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const input = await CliUx.ux.prompt(text, {
      required: options.required,
    })

    if (!input) {
      return null
    }

    const [amount, error] = CurrencyUtils.tryMajorToMinor(
      input,
      options.asset?.id,
      options.asset?.verification,
    )

    if (error) {
      options.logger.error(`Error: ${error.reason}`)
      continue
    }

    Assert.isNotNull(amount)

    if (options.minimum != null && amount < options.minimum) {
      const renderedMinimum = CurrencyUtils.render(
        options.minimum,
        false,
        options.asset?.id,
        options.asset?.verification,
      )
      options.logger.error(`Error: Minimum is ${renderedMinimum}`)
      continue
    }

    return amount
  }
}
