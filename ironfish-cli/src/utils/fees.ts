/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Asset } from '@ironfish/rust-nodejs'
import {
  Assert,
  CreateTransactionRequest,
  CurrencyUtils,
  ERROR_CODES,
  Logger,
  RawTransaction,
  RawTransactionSerde,
  RpcClient,
  RpcRequestError,
} from '@ironfish/sdk'
import { CliUx } from '@oclif/core'
import inquirer from 'inquirer'
import { promptCurrency } from './currency'

export async function selectFee(options: {
  client: Pick<RpcClient, 'wallet'>
  transaction: CreateTransactionRequest
  account?: string
  confirmations?: number
  logger: Logger
}): Promise<RawTransaction> {
  CliUx.ux.action.start('Calculating fees')

  const feeRates = await options.client.wallet.estimateFeeRates()

  const promises = [
    getTxWithFee(
      options.client,
      options.transaction,
      CurrencyUtils.decode(feeRates.content.slow),
    ),
    getTxWithFee(
      options.client,
      options.transaction,
      CurrencyUtils.decode(feeRates.content.average),
    ),
    getTxWithFee(
      options.client,
      options.transaction,
      CurrencyUtils.decode(feeRates.content.fast),
    ),
  ]

  const [slow, average, fast] = await Promise.all(promises)

  const choices = [
    getChoiceFromTx('Slow', slow),
    getChoiceFromTx('Average', average),
    getChoiceFromTx('Fast', fast),
    {
      name: 'Enter a custom fee',
      value: null,
    },
  ]

  CliUx.ux.action.stop()

  const result = await inquirer.prompt<{
    selection: RawTransaction | null
  }>([
    {
      name: 'selection',
      message: `Select the fee you wish to use for this transaction`,
      type: 'list',
      choices,
    },
  ])

  if (result.selection == null) {
    const fee = await promptCurrency({
      client: options.client,
      required: true,
      text: 'Enter the fee amount in $IRON',
      logger: options.logger,
      balance: {
        account: options.account,
        confirmations: options.confirmations,
        assetId: Asset.nativeId().toString('hex'),
      },
    })

    const custom = await options.client.wallet.createTransaction({
      ...options.transaction,
      fee: CurrencyUtils.encode(fee),
    })

    const bytes = Buffer.from(custom.content.transaction, 'hex')
    return RawTransactionSerde.deserialize(bytes)
  }

  Assert.isInstanceOf(result.selection, RawTransaction)
  return result.selection
}

async function getTxWithFee(
  client: Pick<RpcClient, 'wallet'>,
  params: CreateTransactionRequest,
  feeRate: bigint,
): Promise<RawTransaction | null> {
  const promise = client.wallet.createTransaction({
    ...params,
    feeRate: CurrencyUtils.encode(feeRate),
  })

  const response = await promise.catch((e) => {
    if (e instanceof RpcRequestError && e.code === ERROR_CODES.INSUFFICIENT_BALANCE.valueOf()) {
      return null
    } else {
      throw e
    }
  })

  if (response === null) {
    return null
  }

  const bytes = Buffer.from(response.content.transaction, 'hex')
  const raw = RawTransactionSerde.deserialize(bytes)
  return raw
}

function getChoiceFromTx(
  name: string,
  transaction: RawTransaction | null,
): {
  name: string
  disabled?: string | boolean
  value: RawTransaction | null
} {
  return {
    name: `${name} ${transaction ? CurrencyUtils.renderIron(transaction.fee) : ''}`,
    disabled: transaction ? false : 'Not enough $IRON',
    value: transaction,
  }
}
