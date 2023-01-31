/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CurrencyUtils, RawTransaction, RawTransactionSerde, Transaction } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import { flags } from '@oclif/core/lib/parser'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

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
      description: 'The account to burn from',
      required: false,
    }),
    confirm: Flags.boolean({
      default: false,
      description: 'Confirm without asking',
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

    const serialized = Buffer.from(transaction)
    const raw = RawTransactionSerde.deserialize(serialized)

    const client = await this.sdk.connectRpc()

    if (!flags.account) {
      const response = await client.getDefaultAccount()

      if (response.content.account) {
        flags.account = response.content.account.name
      }
    }

    if (!flags.confirm && !this.confirm(raw, flags.account)) {
      this.exit(0)
    }

    CliUx.ux.action.start(`Posting transaction`)

    const response = await client.postTransaction({ transaction, account: flags.account })
    CliUx.ux.action.stop()

    const posted = new Transaction(Buffer.from(response.content, 'hex'))

    this.log(`Posted transaction ${posted.hash().toString('hex')}`)
    this.log('')
    this.log(response.content.transaction)
  }

  confirm(raw: RawTransaction, account: string): Promise<boolean> {
    let spending = 0n
    for (const recieve of raw.receives) {
      spending += recieve.note.value()
    }

    this.log(
      `You are about to post a transaction that sends ${spending}, with ${
        raw.mints.length
      } mints and ${raw.burns.length} burns with a fee ${CurrencyUtils.renderIron(
        raw.fee,
        true,
      )} using account ${account}`,
    )

    return CliUx.ux.confirm('Do you want to post this (Y/N)?')
  }
}
