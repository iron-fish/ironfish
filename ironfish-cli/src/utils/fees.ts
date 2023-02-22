/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

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
import inquirer from 'inquirer'

export async function selectFee(options: {
  client: RpcClient
  transaction: CreateTransactionRequest
  account?: string
  confirmations?: number
}): Promise<RawTransaction> {
  const getTxWithFee = async (
    feeRate: bigint,
  ): Promise<{
    transaction: RawTransaction | null
    fee: bigint
  }> => {
    const promise = options.client.createTransaction({
      ...options.transaction,
      feeRate: CurrencyUtils.encode(feeRate),
    })

    const response = await promise.catch((e) => {
      if (e instanceof RpcRequestError && e.code === ERROR_CODES.INSUFFICIENT_BALANCE) {
        return null
      } else {
        throw e
      }
    })

    if (response === null) {
      return {
        transaction: null,
        fee: feeRate,
      }
    }

    const bytes = Buffer.from(response.content.transaction, 'hex')
    const raw = RawTransactionSerde.deserialize(bytes)

    return {
      transaction: raw,
      fee: feeRate,
    }
  }

  const feeRates = await options.client.estimateFeeRates()

  const [slow, average, fast] = await Promise.all([
    getTxWithFee(CurrencyUtils.decode(feeRates.content.slow)),
    getTxWithFee(CurrencyUtils.decode(feeRates.content.average)),
    getTxWithFee(CurrencyUtils.decode(feeRates.content.fast)),
  ])

  const choices: {
    name: string
    disabled?: string
    value: {
      transaction: RawTransaction | null
      fee: bigint
    }
  }[] = [
    {
      name: 'slow',
      disabled: 'disabled',
      value: {
        transaction: slow.transaction,
        fee: slow.fee,
      },
    },
  ]

  const result = await inquirer.prompt<{
    selection: {
      transaction: RawTransaction | null
      fee: bigint
    }
  }>([
    {
      name: 'selection',
      message: `Select the fee you wish to use for this transaction`,
      type: 'list',
      choices,
    },
  ])

  Assert.isNotNull(result.selection.transaction)
  return result.selection.transaction
}
