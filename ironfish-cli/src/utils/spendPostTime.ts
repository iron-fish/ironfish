/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  BenchUtils,
  CreateTransactionRequest,
  CurrencyUtils,
  EstimateFeeRatesResponse,
  IronfishSdk,
  RawTransactionSerde,
  RpcClient,
  RpcResponseEnded,
  TimeUtils,
} from '@ironfish/sdk'
import { CliUx } from '@oclif/core'
import { fetchNotes } from './notes'

export async function getSpendPostTimeInMs(
  sdk: IronfishSdk,
  client: RpcClient,
  account: string,
  forceBenchmark: boolean,
): Promise<number> {
  let spendPostTime = sdk.internal.get('spendPostTime')

  const spendPostTimeAt = sdk.internal.get('spendPostTimeAt')

  const shouldbenchmark =
    forceBenchmark ||
    spendPostTime <= 0 ||
    Date.now() - spendPostTimeAt > 1000 * 60 * 60 * 24 * 30 // 1 month

  if (shouldbenchmark) {
    spendPostTime = await benchmarkSpendPostTime(client, account)

    sdk.internal.set('spendPostTime', spendPostTime)
    sdk.internal.set('spendPostTimeAt', Date.now())
    await sdk.internal.save()
  }

  return spendPostTime
}

async function benchmarkSpendPostTime(client: RpcClient, account: string): Promise<number> {
  const publicKey = (
    await client.wallet.getAccountPublicKey({
      account: account,
    })
  ).content.publicKey

  const notes = await fetchNotes(client, account, 10)

  CliUx.ux.action.start('Measuring time to combine 1 note')

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

  const delta = Math.ceil(
    (resultTxn2.reduce((acc, curr) => acc + curr, 0) -
      resultTxn1.reduce((acc, curr) => acc + curr, 0)) /
      3,
  )

  CliUx.ux.action.stop(TimeUtils.renderSpan(delta))

  return delta
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
