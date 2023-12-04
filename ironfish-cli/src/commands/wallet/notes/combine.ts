/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  CreateTransactionRequest,
  CurrencyUtils,
  RawTransaction,
  RawTransactionSerde,
  Transaction,
} from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import inquirer from 'inquirer'
import { IronfishCommand } from '../../../command'
import { IronFlag, RemoteFlags } from '../../../flags'
import { selectFee } from '../../../utils/fees'
import { watchTransaction } from '../../../utils/transaction'

const { sort: _ } = CliUx.ux.table.flags()
export class CombineNotesCommand extends IronfishCommand {
  static description = `Display the account notes`

  static flags = {
    ...RemoteFlags,
    confirm: Flags.boolean({
      default: false,
      description: 'Confirm without asking',
    }),
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
  }

  static args = [
    {
      name: 'account',
      required: false,
      description: 'Name of the account to get notes for',
    },
    {
      name: 'to',
      required: false,
      description: 'The public address of the recipient',
    },
  ]

  async getNumberOfNotes(): Promise<{
    low: number
    average: number
    high: number
  }> {
    await Promise.resolve()
    return {
      low: 10,
      average: 20,
      high: 30,
    }
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
    const choices = [
      {
        name: `Low (${low} notes)`,
        value: low,
      },
      {
        name: `Average (${average} notes)`,
        value: average,
      },
      {
        name: `High (${high} notes)`,
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
      const numberOfNotes = parseInt(
        await CliUx.ux.prompt('Enter the number of notes', {
          required: true,
        }),
      )

      if (numberOfNotes > high) {
        // TODO: throw error
        this.error(`The number of notes cannot be higher than the ${high}`)
      }

      if (numberOfNotes < 1) {
        this.error(`The number of notes cannot be lower than 1`)
      }

      return numberOfNotes
    }

    return result.selection
  }

  async start(): Promise<void> {
    /**
     * Changes:
     * 1. Select the fee/ compaction goal in the front
     * 2. Get current fee rate and notes are constant size
     * 3. Move address selection after the goal/ cost section
     */
    const { flags, args } = await this.parse(CombineNotesCommand)

    const client = await this.sdk.connectRpc()

    let to = args.to as string | undefined

    const defaultAccount = await client.wallet.getDefaultAccount()

    if (!defaultAccount.content.account) {
      throw Error(
        `No account is currently active on the node. Cannot send a payout transaction.`,
      )
    }

    let account

    if (!args.account) {
      account = defaultAccount.content.account.name
    } else {
      account = args.account as string
    }

    if (!to) {
      const response1 = await client.wallet.getAccountPublicKey({
        account: defaultAccount.content.account.name,
      })
      to = response1.content.publicKey
    }

    const numberOfNotes = await this.selectNumberOfNotes(await this.getNumberOfNotes())

    const notes1 = await client.wallet.getNotes({
      account: defaultAccount.content.account.name,
      pageSize: numberOfNotes,
      filter: {
        spent: false,
      },
    })

    const notes = notes1.content.notes

    const amount = notes.reduce((acc, note) => acc + BigInt(note.value), 0n)

    const memo = await CliUx.ux.prompt('Enter the memo (or leave blank)', { required: false })

    const params: CreateTransactionRequest = {
      account: account,
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
    }

    let raw: RawTransaction
    if (params.fee === null && params.feeRate === null) {
      raw = await selectFee({
        client,
        transaction: params,
        logger: this.logger,
      })
    } else {
      const response = await client.wallet.createTransaction(params)
      const bytes = Buffer.from(response.content.transaction, 'hex')
      raw = RawTransactionSerde.deserialize(bytes)
    }

    if (!flags.confirm && !(await CliUx.ux.confirm('Do you confirm (Y/N)?'))) {
      this.error('Transaction aborted.')
    }

    CliUx.ux.action.start('Sending the transaction')

    const response = await client.wallet.postTransaction({
      transaction: RawTransactionSerde.serialize(raw).toString('hex'),
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

    this.log(`Sent ${CurrencyUtils.renderIron(amount, true)} to ${to} from ${account}`)
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
}
