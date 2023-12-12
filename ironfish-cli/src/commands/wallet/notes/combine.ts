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
  Transaction,
} from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import inquirer from 'inquirer'
import { IronfishCommand } from '../../../command'
import { IronFlag, RemoteFlags } from '../../../flags'
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
  }

  async getSpendPostTimeInMs(
    client: RpcClient,
    account: string,
    noteSize: number,
  ): Promise<number> {
    let spendPostTime = this.sdk.internal.get('spendPostTime')

    if (spendPostTime <= 0) {
      spendPostTime = await this.benchmarkSpendPostTime(client, account, noteSize)

      this.sdk.internal.set('spendPostTime', spendPostTime)
      await this.sdk.internal.save()
    }

    return spendPostTime
  }

  async benchmarkSpendPostTime(
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

    CliUx.ux.action.start('Calculating the number of notes to combine')

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

    let delta = 0

    for (let i = 0; i < 5; i++) {
      const txn1InMs = await this.measureTransactionPostTime(client, txn1Params, feeRates)
      const txn2InMs = await this.measureTransactionPostTime(client, txn2Params, feeRates)

      delta += txn2InMs - txn1InMs
    }

    CliUx.ux.action.stop()

    return Math.ceil(delta / 5)
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
    pageSize: number,
  ) {
    const getNotesResponse = await client.wallet.getNotes({
      account,
      pageSize,
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

    if (notes.length < 2) {
      this.log(`Your notes are already combined. You currently have ${notes.length} notes.`)
      this.exit(0)
    }

    return notes
  }

  async selectNumberOfNotes(spendPostTimeMs: number): Promise<number> {
    const spendsPerMinute = Math.floor(60000 / spendPostTimeMs)

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

      const numberOfNotes = parseInt(result)

      if (isNaN(numberOfNotes)) {
        this.logger.error(`The number of notes must be a number`)
        continue
      }

      if (numberOfNotes > high) {
        this.logger.error(`The number of notes cannot be higher than the ${high}`)
        continue
      }

      if (numberOfNotes < 2) {
        this.logger.error(`The number of notes cannot be lower than 2`)
        continue
      }

      return numberOfNotes
    }
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

    const noteSize = await this.getNoteSize(client)

    const spendPostTime = await this.getSpendPostTimeInMs(client, from, noteSize)

    let numberOfNotes = await this.selectNumberOfNotes(spendPostTime)

    let notes = await this.fetchNotes(client, from, noteSize, numberOfNotes + 1)

    // If the user doesn't have enough notes for their selection, we reduce the number of notes so that
    // the largest notes can be used for fees.
    if (notes.length < numberOfNotes + 1) {
      numberOfNotes = notes.length - 1
      notes = notes.slice(0, numberOfNotes)
    }

    const amount = notes.reduce((acc, note) => acc + BigInt(note.value), 0n)

    const memo = await CliUx.ux.prompt('Enter the memo (or leave blank)', { required: false })

    const expiration = await this.calculateExpiration(client, spendPostTime, numberOfNotes)

    const params: CreateTransactionRequest = {
      account: from,
      outputs: [
        {
          publicAddress: to,
          amount: CurrencyUtils.encode(amount),
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

    displayTransactionSummary(raw, Asset.nativeId().toString('hex'), amount, from, to, memo)

    if (!(await CliUx.ux.confirm('Do you confirm (Y/N)?'))) {
      this.error('Transaction aborted.')
    }

    CliUx.ux.action.start('Sending the transaction')

    const response = await client.wallet.postTransaction({
      transaction: RawTransactionSerde.serialize(raw).toString('hex'),
      account: from,
    })

    const bytes = Buffer.from(response.content.transaction, 'hex')
    const transaction = new Transaction(bytes)

    CliUx.ux.action.stop()

    if (response.content.accepted === false) {
      this.warn(
        `Transaction '${transaction.hash().toString('hex')}' was not accepted into the mempool`,
      )
    }

    if (response.content.broadcasted === false) {
      this.warn(`Transaction '${transaction.hash().toString('hex')}' failed to broadcast`)
    }

    this.log(`Sent ${CurrencyUtils.renderIron(amount, true)} to ${to} from ${from}`)
    this.log(`Hash: ${transaction.hash().toString('hex')}`)
    this.log(`Fee: ${CurrencyUtils.renderIron(transaction.fee(), true)}`)
    this.log(`Memo: ${memo}`)
    this.log(
      `\nIf the transaction is mined, it will appear here https://explorer.ironfish.network/transaction/${transaction
        .hash()
        .toString('hex')}`,
    )

    if (flags.watch) {
      this.log('')

      await watchTransaction({
        client,
        logger: this.logger,
        hash: transaction.hash().toString('hex'),
      })
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
      const block = new Date(
        (
          await client.chain.getBlock({
            sequence: currentBlockSequence - i,
          })
        ).content.block.timestamp,
      )

      timeLastFiveBlocksInMs += currentBlockTime.getTime() - block.getTime()

      currentBlockTime = block
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

  private async getNoteSize(client: RpcClient) {
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
}
