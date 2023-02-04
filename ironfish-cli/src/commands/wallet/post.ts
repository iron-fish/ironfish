/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CurrencyUtils, RawTransaction, RawTransactionSerde, Transaction } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { ProgressBar } from '../../types'

export class PostCommand extends IronfishCommand {
  static summary = 'Post a raw transaction'

  static description = `Use this command to post a raw transaction.
   The output is a finalized posted transaction. The transaction is also added to the wallet, and sent out to the network.`

  static examples = [
    '$ ironfish wallet:post 618c098d8d008c9f78f6155947014901a019d9ec17160dc0f0d1bb1c764b29b4...',
  ]

  static flags = {
    ...RemoteFlags,
    account: Flags.string({
      description: 'The account that created the raw transaction',
      required: false,
    }),
    confirm: Flags.boolean({
      default: false,
      description: 'Confirm without asking',
    }),
    offline: Flags.boolean({
      default: false,
      description: 'Post transaction offline',
    }),
  }

  static args = [
    {
      name: 'transaction',
      required: true,
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      description: 'The raw transaction in hex encoding',
    },
  ]

  async start(): Promise<void> {
    const { flags, args } = await this.parse(PostCommand)
    const transaction = args.transaction as string

    const serialized = Buffer.from(transaction, 'hex')
    const raw = RawTransactionSerde.deserialize(serialized)

    const client = await this.sdk.connectRpc()

    if (!flags.confirm) {
      let account = flags.account
      if (!flags.account) {
        const response = await client.getDefaultAccount()

        if (response.content.account) {
          account = response.content.account.name
        }
      }

      if (account === undefined) {
        this.error('Can not find an account to confirm the transaction')
      }
      const confirm = await this.confirm(raw, account)

      if (!confirm) {
        this.exit(0)
      }
    }

    const bar = CliUx.ux.progress({
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      format: 'Posting the transaction: [{bar}] {percentage}% | ETA: {eta}s',
    }) as ProgressBar

    bar.start()

    let value = 0
    const timer = setInterval(() => {
      value++
      bar.update(value)
      if (value >= bar.getTotal()) {
        bar.stop()
      }
    }, 1000)

    const stopProgressBar = () => {
      clearInterval(timer)
      bar.update(100)
      bar.stop()
    }

    const response = await client.postTransaction({
      transaction,
      sender: flags.account,
      offline: flags.offline,
    })

    stopProgressBar()

    const posted = new Transaction(Buffer.from(response.content.transaction, 'hex'))

    this.log(`Posted transaction with hash ${posted.hash().toString('hex')}\n`)
    this.log(response.content.transaction)

    if (flags.offline === true) {
      this.log(`\n Run "ironfish wallet:transaction:add" to add the transaction to your wallet`)
    }
  }

  confirm(raw: RawTransaction, account: string): Promise<boolean> {
    let spending = 0n
    for (const recieve of raw.receives) {
      spending += recieve.note.value()
    }

    this.log(
      `You are about to post a transaction that sends ${CurrencyUtils.renderIron(
        spending,
        true,
      )}, with ${raw.mints.length} mints and ${
        raw.burns.length
      } burns with a fee ${CurrencyUtils.renderIron(raw.fee, true)} using account ${account}`,
    )

    return CliUx.ux.confirm('Do you want to post this (Y/N)?')
  }
}
