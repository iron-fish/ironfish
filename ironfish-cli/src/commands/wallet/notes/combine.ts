/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import {
  Assert,
  BenchUtils,
  CreateTransactionRequest,
  CurrencyUtils,
  RawTransaction,
  RawTransactionSerde,
  RpcClient,
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

  async getCombineNoteOptions(
    client: RpcClient,
    account: string,
    currentBlockIndex: number,
  ): Promise<{
    low: number
    average: number
    high: number
  }> {
    let timeToSendOneNote = this.sdk.internal.get('timeToSendOneNote')

    if (timeToSendOneNote <= 0) {
      timeToSendOneNote = await this.benchmarkTimeToSendOneNote(
        client,
        account,
        currentBlockIndex,
      )

      this.sdk.internal.set('timeToSendOneNote', timeToSendOneNote)
      await this.sdk.internal.save()
    }

    const minTime = 60000
    const minNotesToCombine = Math.floor(minTime / timeToSendOneNote)

    return {
      low: minNotesToCombine,
      average: minNotesToCombine * 5,
      high: minNotesToCombine * 10,
    }
  }

  async benchmarkTimeToSendOneNote(
    client: RpcClient,
    account: string,
    currentBlockIndex: number,
  ): Promise<number> {
    CliUx.ux.action.start(
      'Performing a 1-time benchmark to determine how many notes can be combined at a time. This may take a few minutes...',
    )

    const publicKey = (
      await client.wallet.getAccountPublicKey({
        account: account,
      })
    ).content.publicKey

    const getNotesResponse = await client.wallet.getNotes({
      account: account,
      pageSize: 10,
      filter: {
        assetId: Asset.nativeId().toString('hex'),
        spent: false,
      },
    })

    const unfiltered = getNotesResponse.content.notes
    const notes = unfiltered.filter((note) => {
      if (!note.index) {
        return false
      }
      return note.index < currentBlockIndex
    })

    const numberOfNotes = notes.length

    const amount = notes.reduce((acc, note) => acc + BigInt(note.value), 0n)

    const params: CreateTransactionRequest = {
      account: account,
      outputs: [
        {
          publicAddress: publicKey,
          amount: CurrencyUtils.encode(amount),
          memo: '',
        },
      ],
      fee: null,
      feeRate: null,
      notes: notes.map((note) => note.noteHash),
    }

    const feeRates = await client.wallet.estimateFeeRates()

    const start = BenchUtils.start()

    const createTransactionResponse = await client.wallet.createTransaction({
      ...params,
      feeRate: feeRates.content.fast,
    })

    const bytes = Buffer.from(createTransactionResponse.content.transaction, 'hex')
    const raw = RawTransactionSerde.deserialize(bytes)

    await client.wallet.postTransaction({
      transaction: RawTransactionSerde.serialize(raw).toString('hex'),
      broadcast: false,
    })

    const totalTime = BenchUtils.end(start)

    CliUx.ux.action.stop()

    return (totalTime / numberOfNotes) * 2 // adding a buffer to account for the time taken to broadcast a transaction
  }

  async selectNumberOfNotes({
    low,
    average,
    high,
  }: {
    low: number
    average: number
    high: number
  }): Promise<number> {
    // the + 1 is to account for the note that will be used for the fee
    const choices = [
      {
        name: `Low (${low + 1} notes) ~1 minute`,
        value: low,
      },
      {
        name: `Average (${average + 1} notes) ~5 minutes`,
        value: average,
      },
      {
        name: `High (${high + 1} notes) ~10 minutes`,
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

    if (result.selection == null) {
      const promptResult = await CliUx.ux.prompt('Enter the number of notes', {
        required: true,
      })

      if (isNaN(parseInt(promptResult))) {
        this.error(`The number of notes must be a number`)
      }

      const numberOfNotes = parseInt(promptResult)

      if (numberOfNotes > high) {
        this.error(`The number of notes cannot be higher than the ${high}`)
      }

      if (numberOfNotes < 2) {
        this.error(`The number of notes cannot be lower than 2`)
      }

      // accounting for the fee note
      return numberOfNotes - 1
    }

    return result.selection
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(CombineNotesCommand)

    const client = await this.sdk.connectRpc()

    const getDefaultAccountResponse = await client.wallet.getDefaultAccount()
    if (!getDefaultAccountResponse.content.account) {
      this.error(
        `No account is currently active.
         Use ironfish wallet:create <name> to first create an account`,
      )
    }

    const blockIndex = await this.getBlockIndex(client)

    const defaultAccountName = getDefaultAccountResponse.content.account.name

    let to = flags.to?.trim()
    let from = flags.account?.trim()

    if (!from) {
      from = defaultAccountName
    }
    if (!to) {
      const response1 = await client.wallet.getAccountPublicKey({
        account: from,
      })
      to = response1.content.publicKey
    }

    const noteSelectionOptions = await this.getCombineNoteOptions(client, from, blockIndex)

    const unfilteredNotes = (
      await client.wallet.getNotes({
        account: from,
        pageSize: noteSelectionOptions.high + 1,
        filter: {
          assetId: Asset.nativeId().toString('hex'),
          spent: false,
        },
      })
    ).content.notes

    // filter notes by current block index
    const notes = unfilteredNotes.filter((note) => {
      if (!note.index) {
        return false
      }
      return note.index < blockIndex
    })

    if (notes.length < 2) {
      this.error(
        `You must have at least 2 notes to combine. You currently have ${notes.length} notes`,
      )
    }

    noteSelectionOptions.low = Math.min(notes.length - 1, noteSelectionOptions.low)
    noteSelectionOptions.average = Math.min(notes.length - 1, noteSelectionOptions.average)
    noteSelectionOptions.high = Math.min(notes.length - 1, noteSelectionOptions.high)

    const numberOfNotes = await this.selectNumberOfNotes(noteSelectionOptions)

    const notesToCombine = notes.slice(0, numberOfNotes)

    const amount = notesToCombine.reduce((acc, note) => acc + BigInt(note.value), 0n)
    for (const note of notesToCombine) {
      if (note.owner !== to) {
        this.error(
          `All notes must be owned by the same public address. Note ${note.noteHash} is owned by ${note.owner}`,
        )
      }
    }
    const memo = await CliUx.ux.prompt('Enter the memo (or leave blank)', { required: false })

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
      notes: notesToCombine.map((note) => note.noteHash),
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

    // Adding a buffer to avoid a mismatch between confirmations used to load notes and confirmations used when creating witnesses to spend them
    const currentBlockIndex = getBlockResponse.content.block.noteSize - 2
    return currentBlockIndex
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
Notes Combined       ${transaction.spends.length} 
Expiration           ${transaction.expiration ? transaction.expiration.toString() : ''}
`
    this.log(summary)
  }
}
