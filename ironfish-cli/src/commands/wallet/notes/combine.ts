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
import { watchTransaction } from '../../../utils/transaction'

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

  async getSpendPostTime(
    client: RpcClient,
    account: string,
    currentBlockIndex: number,
  ): Promise<number> {
    let timeToSendOneNote = 0 // this.sdk.internal.get('timeToSendOneNote')

    if (timeToSendOneNote <= 0) {
      timeToSendOneNote = await this.benchmarkTimeToSendOneNote(
        client,
        account,
        currentBlockIndex,
      )

      this.sdk.internal.set('timeToSendOneNote', timeToSendOneNote)
      await this.sdk.internal.save()
    }

    return timeToSendOneNote
  }

  // TODO calculate the time to send a note based on the current network conditions differently
  // TODO calculate expiration

  async benchmarkTimeToSendOneNote(
    client: RpcClient,
    account: string,
    currentBlockIndex: number,
  ): Promise<number> {
    CliUx.ux.action.start(
      'Calculating the number of notes to combine. This may take a few minutes...',
    )

    const publicKey = (
      await client.wallet.getAccountPublicKey({
        account: account,
      })
    ).content.publicKey

    const notes = await this.fetchAndFilterNotes(client, account, currentBlockIndex, 10)

    const feeRates = await client.wallet.estimateFeeRates()

    /** Transaction 1 */

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

    /** Transaction 2 */

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

    let timedeltas = 0

    for (let i = 0; i < 5; i++) {
      const totalTimeTxn1 = await this.measureTransactionTime(client, txn1Params, feeRates)
      const totalTimeTxn2 = await this.measureTransactionTime(client, txn2Params, feeRates)
      const difference = totalTimeTxn2 - totalTimeTxn1

      timedeltas += difference
    }

    CliUx.ux.action.stop()

    return Math.ceil(timedeltas / 5)
  }

  private async fetchAndFilterNotes(
    client: RpcClient,
    account: string,
    currentBlockIndex: number,
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

    const unfiltered = getNotesResponse.content.notes
    const notes = unfiltered
      .filter((note) => {
        if (!note.index) {
          return false
        }
        return note.index < currentBlockIndex
      })
      .sort((a, b) => {
        if (a.value < b.value) {
          return -1
        }
        return 1
      })

    if (notes.length <= 2) {
      this.error(
        `You must have at least 3 notes to combine. You currently have ${notes.length} notes`,
      )
    }
    return notes
  }

  private async measureTransactionTime(
    client: RpcClient,
    txn1Params: CreateTransactionRequest,
    feeRates: RpcResponseEnded<EstimateFeeRatesResponse>,
  ) {
    const startTxn1 = BenchUtils.start()

    const createTransactionResponse = await client.wallet.createTransaction({
      ...txn1Params,
      feeRate: feeRates.content.fast,
    })

    const bytes = Buffer.from(createTransactionResponse.content.transaction, 'hex')
    const raw = RawTransactionSerde.deserialize(bytes)

    await client.wallet.postTransaction({
      transaction: RawTransactionSerde.serialize(raw).toString('hex'),
      broadcast: false,
    })

    const totalTimeTxn1 = BenchUtils.end(startTxn1)
    return totalTimeTxn1
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

    const [blockIndex] = await this.getBlockIndex(client)

    const spendPostTime = await this.getSpendPostTime(client, from, blockIndex)

    const numberOfNotes = await this.selectNumberOfNotes(spendPostTime)

    // TODO: ADD ACTION HERE
    const notes = await this.fetchAndFilterNotes(client, from, blockIndex, numberOfNotes + 1)

    if (notes.length < 2) {
      this.log(`Your notes are already combined. You currently have ${notes.length} notes`)
      this.exit(0)
    }

    const amount = notes.reduce((acc, note) => acc + BigInt(note.value), 0n)

    const memo = await CliUx.ux.prompt('Enter the memo (or leave blank)', { required: false })

    const targetBlockTimeInSeconds = (await this.sdk.client.chain.getConsensusParameters())
      .content.targetBlockTimeInSeconds

    const chainInfo = await client.chain.getChainInfo()

    const expiration = Math.ceil(
      parseInt(chainInfo.content.currentBlockIdentifier.index) +
        (spendPostTime * numberOfNotes * 1.5) / 1000 / targetBlockTimeInSeconds,
    )

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

    this.renderTransactionSummary(raw, Asset.nativeId().toString('hex'), amount, from, to, memo)

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

  private async getBlockIndex(client: RpcClient) {
    const getCurrentBlock = await client.chain.getChainInfo()
    const currentBlockSequence = parseInt(getCurrentBlock.content.currentBlockIdentifier.index)

    const getBlockResponse = await client.chain.getBlock({
      sequence: currentBlockSequence,
    })

    Assert.isNotNull(getBlockResponse.content.block.noteSize)

    const config = await client.config.getConfig()

    // Adding a buffer to avoid a mismatch between confirmations used to load notes and confirmations used when creating witnesses to spend them
    const currentBlockIndex =
      getBlockResponse.content.block.noteSize - (config.content.confirmations || 2)
    return [currentBlockIndex, currentBlockSequence]
  }

  renderTransactionSummary(
    transaction: RawTransaction,
    assetId: string,
    amount: bigint,
    from: string,
    to: string,
    memo: string,
  ): void {
    const amountString = CurrencyUtils.renderIron(amount, true, assetId)
    const feeString = CurrencyUtils.renderIron(transaction.fee, true)

    const summary = `\
\nTRANSACTION DETAILS:
From                 ${from}
To                   ${to}
Amount               ${amountString}
Fee                  ${feeString}
Memo                 ${memo}
Outputs              ${transaction.outputs.length}
Notes Combined       ${transaction.spends.length} (includes 1 or more notes for the fee)
Expiration           ${transaction.expiration ? transaction.expiration.toString() : ''}
`
    this.log(summary)
  }
}
