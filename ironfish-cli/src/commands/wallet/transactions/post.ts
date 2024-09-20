/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { RawTransactionSerde, RpcClient, Transaction } from '@ironfish/sdk'
import { Args, Flags, ux } from '@oclif/core'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'
import * as ui from '../../../ui'
import { renderRawTransactionDetails } from '../../../utils/transaction'

export class TransactionsPostCommand extends IronfishCommand {
  static summary = 'post a raw transaction'

  static description = `Use this command to post a raw transaction.
   The output is a finalized posted transaction.`

  static examples = [
    '$ ironfish wallet:post 618c098d8d008c9f78f6155947014901a019d9ec17160dc0f0d1bb1c764b29b4...',
  ]

  static hiddenAliases = ['wallet:post']

  static args = {
    raw_transaction: Args.string({
      description: 'The raw transaction in hex encoding',
    }),
  }

  static flags = {
    ...RemoteFlags,
    account: Flags.string({
      description: 'Name of the account that created the raw transaction',
      char: 'f',
      deprecated: true,
    }),
    confirm: Flags.boolean({
      default: false,
      description: 'Confirm without asking',
    }),
    broadcast: Flags.boolean({
      default: true,
      allowNo: true,
      description: 'Broadcast the transaction after posting',
    }),
  }

  async start(): Promise<void> {
    const { flags, args } = await this.parse(TransactionsPostCommand)
    let transaction = args.raw_transaction

    const client = await this.connectRpc()
    await ui.checkWalletUnlocked(client)

    if (!transaction) {
      transaction = await ui.longPrompt('Enter the raw transaction in hex encoding', {
        required: true,
      })
    }

    const serialized = Buffer.from(transaction, 'hex')
    const raw = RawTransactionSerde.deserialize(serialized)

    const senderAddress = raw.sender()
    if (!senderAddress) {
      this.error('Unable to determine sender for raw transaction')
    }

    const account = await this.getAccountName(client, senderAddress)
    if (!account) {
      this.error(
        `Wallet does not contain sender account with public address ${senderAddress}. Unable to post transaction.`,
      )
    }

    await renderRawTransactionDetails(client, raw, account, this.logger)

    await ui.confirmOrQuit('Do you want to post this?', flags.confirm)

    ux.action.start(`Posting the transaction`)

    const response = await client.wallet.postTransaction({
      transaction,
      broadcast: flags.broadcast,
    })

    ux.action.stop()

    const posted = new Transaction(Buffer.from(response.content.transaction, 'hex'))

    if (response.content.accepted === false) {
      this.warn(
        `Transaction '${posted.hash().toString('hex')}' was not accepted into the mempool`,
      )
    }

    if (response.content.broadcasted === false) {
      this.warn(`Transaction '${posted.hash().toString('hex')}' failed to broadcast`)
    }

    this.log(`Posted transaction with hash ${posted.hash().toString('hex')}\n`)
    this.log(response.content.transaction)

    if (!flags.broadcast) {
      this.log(`\nRun "ironfish wallet:transaction:add" to add the transaction to your wallet`)
    }
  }

  async getAccountName(
    client: Pick<RpcClient, 'wallet'>,
    publicAddress: string,
  ): Promise<string | undefined> {
    const accountNames = await client.wallet.getAccounts()

    for (const accountName of accountNames.content.accounts) {
      const publicKey = await client.wallet.getAccountPublicKey({ account: accountName })

      if (publicKey.content.publicKey === publicAddress) {
        return accountName
      }
    }
  }
}
