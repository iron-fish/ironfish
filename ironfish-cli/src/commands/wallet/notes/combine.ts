/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CreateTransactionRequest } from '@ironfish/sdk'
import { CliUx } from '@oclif/core'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'

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

    const account = args.account as string | undefined

    const defaultAccount = await client.wallet.getDefaultAccount()

    if (!defaultAccount.content.account) {
      throw Error(
        `No account is currently active on the node. Cannot send a payout transaction.`,
      )
    }

    if (!to) {
      const response1 = await client.wallet.getAccountPublicKey({
        account: defaultAccount.content.account.name,
      })
      to = response1.content.publicKey
    }

    const response = client.wallet.getAccountNotesStream({ account })

    const limit = 100

    const notes = []

    for await (const note of response.contentStream()) {
      notes.push(note)
      if (notes.length === limit) {
        break
      }
    }

    const params: CreateTransactionRequest = {
      account: account,
      fee: null,
      feeRate: null,
      notes: notes.map((note) => note.noteHash),
    }

    let raw: RawTransaction
    if (params.fee === null && params.feeRate === null) {
      raw = await selectFee({
        client,
        transaction: params,
        account: from,
        confirmations: flags.confirmations,
        logger: this.logger,
      })
    } else {
      const response = await client.wallet.createTransaction(params)
      const bytes = Buffer.from(response.content.transaction, 'hex')
      raw = RawTransactionSerde.deserialize(bytes)
    }
  }
}
