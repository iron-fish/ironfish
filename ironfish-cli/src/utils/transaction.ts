/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  BenchUtils,
  createRootLogger,
  CreateTransactionRequest,
  CurrencyUtils,
  EstimateFeeRatesResponse,
  IronfishSdk,
  Logger,
  PromiseUtils,
  RawTransaction,
  RawTransactionSerde,
  RpcClient,
  RpcResponseEnded,
  TimeUtils,
  TransactionStatus,
} from '@ironfish/sdk'
import { CliUx } from '@oclif/core'
import { ProgressBar } from '../types'
import { fetchSortedNotes } from './notes'

export class TransactionTimer {
  estimateInMs: number
  spendPostTime: number
  startTime: number
  timer: NodeJS.Timeout | null
  progressBar: ProgressBar

  constructor(spendPostTime: number, raw: RawTransaction) {
    this.estimateInMs = Math.max(Math.ceil(spendPostTime * raw.spends.length), 1000)
    this.spendPostTime = spendPostTime
    this.progressBar = CliUx.ux.progress({
      format: '{title}: [{bar}] {percentage}% | {estimate}',
    }) as ProgressBar
    this.startTime = 0

    this.timer = null
  }

  start(): void {
    if (this.startTime > 0 || this.spendPostTime <= 0) {
      return
    }
    this.startTime = Date.now()

    if (this.spendPostTime > 0) {
      const logger = createRootLogger()
      logger.log(
        `Time to send: ${TimeUtils.renderSpan(this.estimateInMs, {
          hideMilliseconds: true,
        })}`,
      )
    }

    this.progressBar.start(100, 0, {
      title: 'Sending the transaction',
      estimate: TimeUtils.renderSpan(this.estimateInMs, { hideMilliseconds: true }),
    })

    this.timer = setInterval(() => {
      const durationInMs = Date.now() - this.startTime
      const timeRemaining = this.estimateInMs - durationInMs
      const progress = Math.round((durationInMs / this.estimateInMs) * 100)

      this.progressBar.update(progress, {
        estimate: TimeUtils.renderSpan(timeRemaining, { hideMilliseconds: true }),
      })
    }, 1000)
  }

  stop(logger?: Logger): void {
    if (this.timer === null) {
      return
    }

    logger = logger ?? createRootLogger()

    clearInterval(this.timer)
    this.progressBar.update(100)
    this.progressBar.stop()

    logger.log(
      `Sending took ${TimeUtils.renderSpan(Date.now() - this.startTime, {
        hideMilliseconds: true,
      })}`,
    )
  }
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

async function benchmarkSpendPostTime(client: RpcClient, account: string): Promise<number> {
  const publicKey = (
    await client.wallet.getAccountPublicKey({
      account: account,
    })
  ).content.publicKey

  const notes = await fetchSortedNotes(client, account, 10)

  // need at least 3 notes to measure the time to combine 2 notes
  if (notes.length < 3) {
    return 0
  }

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

export async function getSpendPostTimeInMs(
  client: RpcClient,
  sdk: IronfishSdk,
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
    if (spendPostTime !== 0) {
      sdk.internal.set('spendPostTime', spendPostTime)
      sdk.internal.set('spendPostTimeAt', Date.now())
      await sdk.internal.save()
    }
  }

  return spendPostTime
}

export function displayTransactionSummary(
  transaction: RawTransaction,
  assetId: string,
  amount: bigint,
  from: string,
  to: string,
  memo: string,

  logger?: Logger,
): void {
  logger = logger ?? createRootLogger()

  const amountString = CurrencyUtils.renderIron(amount, true, assetId)
  const feeString = CurrencyUtils.renderIron(transaction.fee, true)

  const summary = `\
\nTRANSACTION SUMMARY:
From                 ${from}
To                   ${to}
Amount               ${amountString}
Fee                  ${feeString}
Memo                 ${memo}
Outputs              ${transaction.outputs.length}
Spends               ${transaction.spends.length}
Expiration           ${transaction.expiration ? transaction.expiration.toString() : ''}
`
  logger.log(summary)
}

export async function watchTransaction(options: {
  client: Pick<RpcClient, 'wallet'>
  hash: string
  account?: string
  confirmations?: number
  waitUntil?: TransactionStatus
  pollFrequencyMs?: number
  logger?: Logger
}): Promise<void> {
  const logger = options.logger ?? createRootLogger()
  const waitUntil = options.waitUntil ?? TransactionStatus.CONFIRMED
  const pollFrequencyMs = options.pollFrequencyMs ?? 10000

  let lastTime = Date.now()

  let last = await options.client.wallet.getAccountTransaction({
    account: options.account,
    hash: options.hash,
    confirmations: options.confirmations,
  })

  const startTime = lastTime

  let prevStatus: TransactionStatus | 'not found' =
    last?.content.transaction?.status ?? 'not found'
  let currentStatus = prevStatus

  // If the transaction is already in the desired state, return
  if (currentStatus === waitUntil) {
    logger.log(`Transaction ${options.hash} is ${waitUntil}`)
    return
  }

  logger.log(`Watching transaction ${options.hash}`)

  CliUx.ux.action.start(`Current Status`)
  const span = TimeUtils.renderSpan(0, { hideMilliseconds: true })
  CliUx.ux.action.status = `${currentStatus} ${span}`

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const response = await options.client.wallet.getAccountTransaction({
      account: options.account,
      hash: options.hash,
      confirmations: options.confirmations,
    })

    currentStatus = response?.content.transaction?.status ?? 'not found'

    if (prevStatus !== 'not found' && currentStatus === 'not found') {
      CliUx.ux.action.stop(`Transaction ${options.hash} deleted while watching it.`)
      break
    }

    if (currentStatus === prevStatus) {
      const duration = Date.now() - lastTime
      const span = TimeUtils.renderSpan(duration, { hideMilliseconds: true })
      CliUx.ux.action.status = `${currentStatus} ${span}`
      await PromiseUtils.sleep(pollFrequencyMs)
      continue
    }

    // State has changed
    const now = Date.now()
    const duration = now - lastTime
    lastTime = now

    CliUx.ux.action.stop(
      `${prevStatus} -> ${currentStatus}: ${TimeUtils.renderSpan(duration, {
        hideMilliseconds: true,
      })}`,
    )

    last = response
    prevStatus = currentStatus

    CliUx.ux.action.start(`Current Status`)
    const span = TimeUtils.renderSpan(0, { hideMilliseconds: true })
    CliUx.ux.action.status = `${currentStatus} ${span}`

    if (currentStatus === waitUntil) {
      const duration = now - startTime
      const span = TimeUtils.renderSpan(duration, { hideMilliseconds: true })
      CliUx.ux.action.stop(`done after ${span}`)
      break
    }
  }
}
