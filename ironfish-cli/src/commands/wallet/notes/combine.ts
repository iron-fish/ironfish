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
import { CliUx } from '@oclif/core'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'
import { selectFee } from '../../../utils/fees'
import { watchTransaction } from '../../../utils/transaction'

const { sort: _, ...tableFlags } = CliUx.ux.table.flags()
export class CombineNotesCommand extends IronfishCommand {
  static description = `Display the account notes`

  static flags = {
    ...RemoteFlags,
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

  async start(): Promise<void> {
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

    const noteStream = client.wallet.getAccountNotesStream({ account })

    const limit = 100

    const notes = []

    for await (const note of noteStream.contentStream()) {
      notes.push(note)
      if (notes.length === limit) {
        break
      }
    }

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
        account: account,
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
      account: account,
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
        account: account,
        hash: transaction.hash().toString('hex'),
      })
    }
  }
}
