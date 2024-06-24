/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import {
  BenchUtils,
  CreateTransactionRequest,
  CurrencyUtils,
  EstimateFeeRatesResponse,
  IronfishSdk,
  RawTransaction,
  RawTransactionSerde,
  RpcClient,
  RpcResponseEnded,
  TimeUtils,
} from '@ironfish/sdk'
import { ux } from '@oclif/core'
import { fetchNotes } from './note'

/**
 * Recalculates the average spendPostTime based on the new measurement.
 */
export async function updateSpendPostTimeInMs(
  sdk: IronfishSdk,
  raw: RawTransaction,
  startTime: number,
  endTime: number,
) {
  if (raw.spends.length === 0) {
    return
  }

  const transactionDuration = endTime - startTime
  const averageSpendTime = Math.ceil(transactionDuration / raw.spends.length)

  const oldAverage = sdk.internal.get('spendPostTime')
  const oldMeasurementCount = sdk.internal.get('spendPostTimeMeasurements')

  // Calculate the new average using the formula: ((oldAverage * oldCount) + newValue) / newCount
  const newMeasurementCount = oldMeasurementCount + 1
  const newAverageSpendPostTime =
    (oldAverage * oldMeasurementCount + averageSpendTime) / newMeasurementCount

  sdk.internal.set('spendPostTime', newAverageSpendPostTime)
  sdk.internal.set('spendPostTimeMeasurements', newMeasurementCount)
  await sdk.internal.save()
}

export function getSpendPostTimeInMs(sdk: IronfishSdk): number {
  return sdk.internal.get('spendPostTime')
}

export async function benchmarkSpendPostTime(
  sdk: IronfishSdk,
  client: RpcClient,
  account: string,
): Promise<number> {
  ux.action.start('Measuring time to combine 1 note')

  const publicKey = (
    await client.wallet.getAccountPublicKey({
      account: account,
    })
  ).content.publicKey

  const notes = await fetchNotes(client, account, Asset.nativeId().toString('hex'), 10)

  // Not enough notes in the account to measure the time to combine a note
  if (notes.length < 3) {
    ux.error('Not enough notes.')
  }

  const feeRates = await client.wallet.estimateFeeRates()

  /** Transaction 1: selects 1 note */

  const txn1Params: CreateTransactionRequest = {
    account: account,
    outputs: [
      {
        publicAddress: publicKey,
        amount: CurrencyUtils.encode(BigInt(notes[0].value)),
        memo: '',
      },
    ],
    fee: null,
    feeRate: null,
    notes: [notes[0].noteHash],
  }

  /** Transaction 2: selects two notes */

  const txn2Params: CreateTransactionRequest = {
    account: account,
    outputs: [
      {
        publicAddress: publicKey,
        amount: CurrencyUtils.encode(BigInt(notes[0].value) + BigInt(notes[1].value)),
        memo: '',
      },
    ],
    fee: null,
    feeRate: null,
    notes: [notes[0].noteHash, notes[1].noteHash],
  }

  const promisesTxn1 = []
  const promisesTxn2 = []

  for (let i = 0; i < 3; i++) {
    promisesTxn1.push(measureTransactionPostTime(client, txn1Params, feeRates))
    promisesTxn2.push(measureTransactionPostTime(client, txn2Params, feeRates))
  }

  const resultTxn1 = await Promise.all(promisesTxn1)
  const resultTxn2 = await Promise.all(promisesTxn2)

  const spendPostTime = Math.ceil(
    (resultTxn2.reduce((acc, curr) => acc + curr, 0) -
      resultTxn1.reduce((acc, curr) => acc + curr, 0)) /
      3,
  )

  if (spendPostTime <= 0) {
    ux.error('Error calculating spendPostTime. Please try again.')
  }

  ux.action.stop(TimeUtils.renderSpan(spendPostTime))
  sdk.internal.set('spendPostTime', spendPostTime)
  sdk.internal.set('spendPostTimeMeasurements', 1)
  await sdk.internal.save()

  return spendPostTime
}

async function measureTransactionPostTime(
  client: RpcClient,
  params: CreateTransactionRequest,
  feeRates: RpcResponseEnded<EstimateFeeRatesResponse>,
) {
  const response = await client.wallet.createTransaction({
    ...params,
    feeRate: feeRates.content.fast,
  })

  const bytes = Buffer.from(response.content.transaction, 'hex')
  const raw = RawTransactionSerde.deserialize(bytes)

  const start = BenchUtils.start()

  await client.wallet.postTransaction({
    transaction: RawTransactionSerde.serialize(raw).toString('hex'),
    broadcast: false,
  })

  return BenchUtils.end(start)
}
