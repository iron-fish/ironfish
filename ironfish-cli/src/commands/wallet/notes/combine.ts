/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import {
  Assert,
  BenchUtils,
  CreateTransactionRequest,
  CurrencyUtils,
  EstimateFeeRatesResponse,
  RawTransaction,
  RawTransactionSerde,
  RpcClient,
  RpcResponseEnded,
  TimeUtils,
  Transaction,
} from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import inquirer from 'inquirer'
import { IronfishCommand } from '../../../command'
import { IronFlag, RemoteFlags } from '../../../flags'
import { ProgressBar } from '../../../types'
import { getExplorer } from '../../../utils/explorer'
import { selectFee } from '../../../utils/fees'
import { displayTransactionSummary, watchTransaction } from '../../../utils/transaction'

export class CombineNotesCommand extends IronfishCommand {
  static description = `Combine notes into a single note`

  static flags = {
    ...RemoteFlags,
    fee: IronFlag({
      char: 'o',
      description: 'The fee amount in IRON',
      minimum: 1n,
      flagName: 'fee',
    }),
    feeRate: IronFlag({
      char: 'r',
      description: 'The fee rate amount in IRON/Kilobyte',
      minimum: 1n,
      flagName: 'fee rate',
    }),
    memo: Flags.string({
      char: 'm',
      description: 'The memo of transaction',
    }),
    notes: Flags.integer({
      description: 'How many notes to combine',
    }),
    confirm: Flags.boolean({
      default: false,
      description: 'Confirm without asking',
    }),
    watch: Flags.boolean({
      default: false,
      description: 'Wait for the transaction to be confirmed',
    }),
    to: Flags.string({
      char: 't',
      description: 'The public address of the recipient',
    }),
    account: Flags.string({
      char: 'f',
      description: 'The account to send money from',
    }),
    benchmark: Flags.boolean({
      hidden: true,
      default: false,
      description: 'Force run the benchmark to measure the time to combine 1 note',
    }),
  }

  private async getSpendPostTimeInMs(
    client: RpcClient,
    account: string,
    noteSize: number,
    forceBenchmark: boolean,
  ): Promise<number> {
    let spendPostTime = this.sdk.internal.get('spendPostTime')

    const spendPostTimeAt = this.sdk.internal.get('spendPostTimeAt')

    const shouldbenchmark =
      forceBenchmark ||
      spendPostTime <= 0 ||
      Date.now() - spendPostTimeAt > 1000 * 60 * 60 * 24 * 30 // 1 month

    if (shouldbenchmark) {
      spendPostTime = await this.benchmarkSpendPostTime(client, account, noteSize)

      this.sdk.internal.set('spendPostTime', spendPostTime)
      this.sdk.internal.set('spendPostTimeAt', Date.now())
      await this.sdk.internal.save()
    }

    return spendPostTime
  }

  private async benchmarkSpendPostTime(
    client: RpcClient,
    account: string,
    noteSize: number,
  ): Promise<number> {
    const publicKey = (
      await client.wallet.getAccountPublicKey({
        account: account,
      })
    ).content.publicKey

    const notes = await this.fetchNotes(client, account, noteSize, 10)

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
      promisesTxn1.push(this.measureTransactionPostTime(client, txn1Params, feeRates))
      promisesTxn2.push(this.measureTransactionPostTime(client, txn2Params, feeRates))
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

  private async measureTransactionPostTime(
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

  private async fetchNotes(
    client: RpcClient,
    account: string,
    noteSize: number,
    notesToCombine: number,
  ) {
    notesToCombine = Math.max(notesToCombine, 10) // adds a buffer in case the user selects a small number of notes and they get filtered out by noteSize

    const getNotesResponse = await client.wallet.getNotes({
      account,
      pageSize: notesToCombine,
      filter: {
        assetId: Asset.nativeId().toString('hex'),
        spent: false,
      },
    })

    // filtering notes by noteSize and sorting them by value in ascending order
    const notes = getNotesResponse.content.notes
      .filter((note) => {
        if (!note.index) {
          return false
        }
        return note.index < noteSize
      })
      .sort((a, b) => {
        if (a.value < b.value) {
          return -1
        }
        return 1
      })

    // must have at least three notes so that you can combine 2 and use another for fees
    if (notes.length < 3) {
      this.log(`Your notes are already combined. You currently have ${notes.length} notes.`)
      this.exit(0)
    }

    return notes
  }

  private async selectNotesToCombine(spendPostTimeMs: number): Promise<number> {
    const spendsPerMinute = Math.max(Math.floor(60000 / spendPostTimeMs), 2) // minimum of 2 notes per minute in case the spentPostTime is very high

    const low = spendsPerMinute
    const medium = spendsPerMinute * 5
    const high = spendsPerMinute * 10

    const choices = [
      {
        name: `~1 minute: ${low} notes`,
        value: low,
      },
      {
        name: `~5 minutes: ${medium} notes`,
        value: medium,
        default: true,
      },
      {
        name: `~10 minutes: ${high} notes`,
        value: high,
      },
      {
        name: 'Enter a custom number of notes',
        value: null,
      },
    ]

    const result = await inquirer.prompt<{
      selection: number
    }>([
      {
        name: 'selection',
        message: `Select the number of notes you wish to combine (MAX): `,
        type: 'list',
        choices,
      },
    ])

    if (result.selection) {
      return result.selection
    }

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const result = await CliUx.ux.prompt('Enter the number of notes', {
        required: true,
      })

      const notesToCombine = parseInt(result)

      if (isNaN(notesToCombine)) {
        this.logger.error(`The number of notes must be a number`)
        continue
      }

      if (notesToCombine > high) {
        this.logger.error(`The number of notes cannot be higher than the ${high}`)
        continue
      }

      if (notesToCombine < 2) {
        this.logger.error(`The number must be larger than 1`)
        continue
      }

      return notesToCombine
    }
  }

  private async calculateExpiration(
    client: RpcClient,
    spendPostTimeInMs: number,
    numberOfNotes: number,
  ) {
    const currentBlockSequence = await this.getCurrentBlockSequence(client)

    let timeLastFiveBlocksInMs = 0

    let currentBlockTime = new Date(
      (
        await client.chain.getBlock({
          sequence: currentBlockSequence,
        })
      ).content.block.timestamp,
    )

    for (let i = 0; i < 5; i++) {
      const blockTime = new Date(
        (
          await client.chain.getBlock({
            sequence: currentBlockSequence - i,
          })
        ).content.block.timestamp,
      )

      timeLastFiveBlocksInMs += currentBlockTime.getTime() - blockTime.getTime()

      currentBlockTime = blockTime
    }

    const averageBlockTimeInMs = timeLastFiveBlocksInMs / 5

    const targetBlockTimeInMs =
      (await client.chain.getConsensusParameters()).content.targetBlockTimeInSeconds * 1000

    const blockTimeForCalculation = Math.min(averageBlockTimeInMs, targetBlockTimeInMs)

    let expiration = Math.ceil(
      currentBlockSequence + (spendPostTimeInMs * numberOfNotes * 2) / blockTimeForCalculation, // * 2 added to account for the time it takes to calculate fees
    )

    const config = await client.config.getConfig()

    if (config.content.transactionExpirationDelta) {
      expiration = Math.max(
        currentBlockSequence + config.content.transactionExpirationDelta,
        expiration,
      )
    }

    return expiration
  }

  private async getNoteTreeSize(client: RpcClient) {
    const getCurrentBlock = await client.chain.getChainInfo()

    const currentBlockSequence = parseInt(getCurrentBlock.content.currentBlockIdentifier.index)

    const getBlockResponse = await client.chain.getBlock({
      sequence: currentBlockSequence,
    })

    Assert.isNotNull(getBlockResponse.content.block.noteSize)

    const config = await client.config.getConfig()

    // Adding a buffer to avoid a mismatch between confirmations used to load notes and confirmations used when creating witnesses to spend them
    return getBlockResponse.content.block.noteSize - (config.content.confirmations || 2)
  }

  private async getCurrentBlockSequence(client: RpcClient) {
    const getCurrentBlock = await client.chain.getChainInfo()
    const currentBlockSequence = parseInt(getCurrentBlock.content.currentBlockIdentifier.index)
    return currentBlockSequence
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(CombineNotesCommand)

    const client = await this.sdk.connectRpc()

    let to = flags.to
    let from = flags.account

    if (!from) {
      const response = await client.wallet.getDefaultAccount()

      if (!response.content.account) {
        this.error(
          `No account is currently active.
          Use ironfish wallet:create <name> to first create an account`,
        )
      }

      from = response.content.account.name
    }

    if (!to) {
      const response = await client.wallet.getAccountPublicKey({
        account: from,
      })

      to = response.content.publicKey
    }

    // the confirmation range in the merkle tree for notes that are safe to use
    const noteSize = await this.getNoteTreeSize(client)

    const spendPostTime = await this.getSpendPostTimeInMs(
      client,
      from,
      noteSize,
      flags.benchmark,
    )

    let numberOfNotes = flags.notes

    if (numberOfNotes === undefined) {
      numberOfNotes = await this.selectNotesToCombine(spendPostTime)
    }

    let notes = await this.fetchNotes(client, from, noteSize, numberOfNotes)

    // If the user doesn't have enough notes for their selection, we reduce the number of notes so that
    // the largest note can be used for fees.
    if (notes.length < numberOfNotes) {
      numberOfNotes = notes.length - 1
    }

    notes = notes.slice(0, numberOfNotes)

    const amountIncludingFees = notes.reduce((acc, note) => acc + BigInt(note.value), 0n)

    const memo =
      flags.memo?.trim() ??
      (await CliUx.ux.prompt('Enter the memo (or leave blank)', { required: false }))

    const expiration = await this.calculateExpiration(client, spendPostTime, numberOfNotes)

    const params: CreateTransactionRequest = {
      account: from,
      outputs: [
        {
          publicAddress: to,
          amount: CurrencyUtils.encode(amountIncludingFees),
          memo,
        },
      ],
      fee: flags.fee ? CurrencyUtils.encode(flags.fee) : null,
      feeRate: flags.feeRate ? CurrencyUtils.encode(flags.feeRate) : null,
      notes: notes.map((note) => note.noteHash),
      expiration,
    }

    let raw: RawTransaction
    if (params.fee === null && params.feeRate === null) {
      raw = await selectFee({
        client,
        transaction: params,
        account: from,
        logger: this.logger,
      })
    } else {
      const response = await client.wallet.createTransaction(params)
      const bytes = Buffer.from(response.content.transaction, 'hex')
      raw = RawTransactionSerde.deserialize(bytes)
    }

    // This allows for a single note output.
    const amount = amountIncludingFees - raw.fee
    params.outputs[0].amount = CurrencyUtils.encode(amount)
    params.fee = CurrencyUtils.encode(raw.fee)

    const createTransactionResponse = await client.wallet.createTransaction(params)
    const createTransactionBytes = Buffer.from(
      createTransactionResponse.content.transaction,
      'hex',
    )
    raw = RawTransactionSerde.deserialize(createTransactionBytes)

    displayTransactionSummary(raw, Asset.nativeId().toString('hex'), amount, from, to, memo)

    const estimateInMs = Math.max(Math.ceil(spendPostTime * raw.spends.length), 1000)

    this.log(
      `Time to send: ${TimeUtils.renderSpan(estimateInMs, {
        hideMilliseconds: true,
      })}`,
    )
    if (!flags.confirm) {
      const confirmed = await CliUx.ux.confirm('Do you confirm (Y/N)?')
      if (!confirmed) {
        this.error('Transaction aborted.')
      }
    }

    const progressBar = CliUx.ux.progress({
      format: '{title}: [{bar}] {percentage}% | {estimate}',
    }) as ProgressBar

    const startTime = Date.now()

    progressBar.start(100, 0, {
      title: 'Sending the transaction',
      estimate: TimeUtils.renderSpan(estimateInMs, { hideMilliseconds: true }),
    })

    const timer = setInterval(() => {
      const durationInMs = Date.now() - startTime
      const timeRemaining = estimateInMs - durationInMs
      const progress = Math.round((durationInMs / estimateInMs) * 100)

      progressBar.update(progress, {
        estimate: TimeUtils.renderSpan(timeRemaining, { hideMilliseconds: true }),
      })
    }, 1000)

    const response = await client.wallet.postTransaction({
      transaction: RawTransactionSerde.serialize(raw).toString('hex'),
      account: from,
    })

    const bytes = Buffer.from(response.content.transaction, 'hex')
    const transaction = new Transaction(bytes)

    clearInterval(timer)
    progressBar.update(100)
    progressBar.stop()

    this.log(
      `Sending took ${TimeUtils.renderSpan(Date.now() - startTime, {
        hideMilliseconds: true,
      })}`,
    )

    if (response.content.accepted === false) {
      this.warn(
        `Transaction '${transaction.hash().toString('hex')}' was not accepted into the mempool`,
      )
    }

    if (response.content.broadcasted === false) {
      this.warn(`Transaction '${transaction.hash().toString('hex')}' failed to broadcast`)
    }

    await this.displayCombinedNoteHashes(client, from, transaction)

    this.log(`Transaction hash: ${transaction.hash().toString('hex')}`)

    const networkId = (await client.chain.getNetworkInfo()).content.networkId
    const transactionUrl = getExplorer(networkId)?.getTransactionUrl(
      transaction.hash().toString('hex'),
    )

    if (transactionUrl) {
      this.log(`\nIf the transaction is mined, it will appear here: ${transactionUrl}`)
    }

    if (flags.watch) {
      this.log('')

      await watchTransaction({
        client,
        logger: this.logger,
        account: from,
        hash: transaction.hash().toString('hex'),
      })
    }
  }

  private async displayCombinedNoteHashes(
    client: RpcClient,
    from: string,
    transaction: Transaction,
  ) {
    const resultingNotes = (
      await client.wallet.getAccountTransaction({
        account: from,
        hash: transaction.hash().toString('hex'),
      })
    ).content.transaction?.notes

    if (resultingNotes) {
      this.log('')
      CliUx.ux.table(resultingNotes, {
        hash: {
          header: 'Notes Created',
          get: (note) => note.noteHash,
        },
        value: {
          header: 'Value',
          get: (note) => CurrencyUtils.renderIron(note.value, true),
        },
        owner: {
          header: 'Owner',
          get: (note) => note.owner,
        },
      })
      this.log('')
    }
  }
}
