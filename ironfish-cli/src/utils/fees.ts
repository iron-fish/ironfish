/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Asset } from '@ironfish/rust-nodejs'
import {
  Assert,
  CreateTransactionRequest,
  CurrencyUtils,
  ERROR_CODES,
  RawTransaction,
  RawTransactionSerde,
  RpcClient,
  RpcRequestError,
} from '@ironfish/sdk'
import { CliUx } from '@oclif/core'
import inquirer from 'inquirer'

export async function selectFee(options: {
  client: RpcClient
  transaction: CreateTransactionRequest
  account?: string
  confirmations?: number
}): Promise<RawTransaction> {
  const feeRates = await options.client.estimateFeeRates()

  const [slow, average, fast] = await Promise.all([
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
  ])

  const choices = [
    getChoiceFromTx('Slow', slow),
    getChoiceFromTx('Average', average),
    getChoiceFromTx('Fast', fast),
    {
      name: 'Enter your own',
      value: null,
    },
  ]

  const result = await inquirer.prompt<{
    selection: {
      transaction: RawTransaction | null
      fee: bigint
    } | null
  }>([
    {
      name: 'selection',
      message: `Select the fee you wish to use for this transaction`,
      type: 'list',
      choices,
    },
  ])

  if (result.selection == null) {
    const response = await options.client.getAccountBalance({
      assetId: Asset.nativeId().toString('hex'),
      confirmations: options.confirmations,
    })

    const input = await CliUx.ux.prompt(
      `Enter the fee amount in $IRON (balance: ${CurrencyUtils.renderIron(
        response.content.confirmed,
      )})`,
      {
        required: true,
      },
    )

    throw new Error('Not implemented yet')
  }

  Assert.isNotNull(result.selection.transaction)
  return result.selection.transaction
}

async function getTxWithFee(
  client: RpcClient,
  params: CreateTransactionRequest,
  feeRate: bigint,
): Promise<RawTransaction | null> {
  const promise = client.createTransaction({
    ...params,
    feeRate: CurrencyUtils.encode(feeRate),
  })

  const response = await promise.catch((e) => {
    if (e instanceof RpcRequestError && e.code === ERROR_CODES.INSUFFICIENT_BALANCE) {
      return null
    } else {
      throw e
    }
  })

  if (Math.random() < 1) {
    return null
  }

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
