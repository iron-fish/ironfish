/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Asset } from '@ironfish/rust-nodejs'
import { Assert, CurrencyUtils, Logger, RpcClient } from '@ironfish/sdk'
import { CliUx } from '@oclif/core'

export async function promptCurrency(options: {
  client: RpcClient
  text: string
  logger: Logger
  required: true
  minimum?: bigint
  balance?: {
    account?: string
    assetId?: string
    confirmations?: number
    minimalBalance?: bigint
  }
}): Promise<bigint>

export async function promptCurrency(options: {
  client: RpcClient
  text: string
  logger: Logger
  required?: boolean
  minimum?: bigint
  balance?: {
    account?: string
    assetId?: string
    confirmations?: number
    minimalBalance?: bigint
  }
}): Promise<bigint | null> {
  let text = options.text
  let balanceInOre = 0n
  let balance = 0n

  if (options.balance) {
    const balanceResponse = await options.client.getAccountBalance({
      assetId: options.balance.assetId ?? Asset.nativeId().toString('hex'),
      confirmations: options.balance.confirmations,
    })

    balance = CurrencyUtils.decode(balanceResponse.content.available)

    if (options.balance.assetId === Asset.nativeId().toString('hex')) {
      balanceInOre = balance
    }

    if (options.balance.minimalBalance && balance < options.balance.minimalBalance) {
      if (options.balance.minimalBalance === 2n) {
        options.logger.log(
          'Balance is not enough for the transaction. Require a minimal transaction of 1 ore and minimal transaction fee of 1 ore.',
        )
      } else {
        options.logger.log('Balance is not enough for the transaction.')
      }

      return null
    }

    text += ` (balance ${CurrencyUtils.renderIron(balance)})`
  }

  // get balance of native asset if above code have not got it.
  if (balanceInOre === 0n) {
    const balanceResponse = await options.client.getAccountBalance({
      assetId: Asset.nativeId().toString('hex'),
      confirmations: options.balance?.confirmations ?? 0,
    })

    balanceInOre = CurrencyUtils.decode(balanceResponse.content.available)

    if (balanceInOre <= 0) {
      options.logger.log('Balance of native asset is not enough for the transaction.')
      return null
    }
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const input = await CliUx.ux.prompt(text, {
      required: options.required,
    })

    if (!input) {
      return null
    }

    const [amount, error] = CurrencyUtils.decodeIronTry(input)

    if (error) {
      options.logger.error(`Error: ${error.reason}`)
      continue
    }

    Assert.isNotNull(amount)

    if (options.minimum != null && amount < options.minimum) {
      options.logger.error(`Error: Minimum is ${CurrencyUtils.renderIron(options.minimum)}`)
      continue
    }

    if (
      options.balance &&
      options.balance.assetId === Asset.nativeId().toString('hex') &&
      options.balance.minimalBalance &&
      options.balance.minimalBalance > 1n &&
      amount === balanceInOre
    ) {
      options.logger.error(
        `Insufficient funds available for the transaction. Require a minimal transaction fee of 1 ore.`,
      )
      continue
    }

    if (
      options.balance &&
      options.balance.assetId !== Asset.nativeId().toString('hex') &&
      amount > balance
    ) {
      options.logger.error(`Insufficient funds available for the transaction.`)
      continue
    }

    return amount
  }
}
