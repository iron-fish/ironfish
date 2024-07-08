/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Asset } from '@ironfish/rust-nodejs'
import { Assert, CurrencyUtils, Logger, RpcAssetVerification, RpcClient } from '@ironfish/sdk'
import { inputPrompt } from '../ui'

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
  assetId?: string
  assetVerification?: RpcAssetVerification
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
  assetId?: string
  assetVerification?: RpcAssetVerification
  balance?: {
    account?: string
    confirmations?: number
  }
}): Promise<bigint | null> {
  let text = options.text

  if (options.balance) {
    const balance = await options.client.wallet.getAccountBalance({
      account: options.balance.account,
      assetId: options.assetId ?? Asset.nativeId().toString('hex'),
      confirmations: options.balance.confirmations,
    })

    const renderedAvailable = CurrencyUtils.render(
      balance.content.available,
      false,
      options.assetId,
      options.assetVerification,
    )
    text += ` (balance ${renderedAvailable})`
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const input = await inputPrompt(text, options.required)

    if (!input) {
      return null
    }

    const [amount, error] = CurrencyUtils.tryMajorToMinor(
      input,
      options.assetId,
      options.assetVerification,
    )

    if (error) {
      options.logger.error(`Error: ${error.message}`)
      continue
    }

    Assert.isNotNull(amount)

    if (options.minimum != null && amount < options.minimum) {
      const renderedMinimum = CurrencyUtils.render(
        options.minimum,
        false,
        options.assetId,
        options.assetVerification,
      )
      options.logger.error(`Error: Minimum is ${renderedMinimum}`)
      continue
    }

    return amount
  }
}
