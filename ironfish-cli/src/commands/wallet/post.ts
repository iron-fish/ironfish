/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { RawTransaction, RawTransactionSerde, RpcClient, Transaction } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { longPrompt } from '../../utils/longPrompt'
import { renderRawTransactionDetails } from '../../utils/transaction'

export class PostCommand extends IronfishCommand {
  static summary = 'Post a raw transaction'

  static description = `Use this command to post a raw transaction.
   The output is a finalized posted transaction.`

  static examples = [
    '$ ironfish wallet:post 618c098d8d008c9f78f6155947014901a019d9ec17160dc0f0d1bb1c764b29b4...',
  ]

  static flags = {
    ...RemoteFlags,
    account: Flags.string({
      description: 'The account that created the raw transaction',
      char: 'f',
      required: false,
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

  static args = [
    {
      name: 'transaction',
      description: 'The raw transaction in hex encoding',
    },
  ]

  async start(): Promise<void> {
    const { flags, args } = await this.parse(PostCommand)
    let transaction = args.transaction as string | undefined

    if (!transaction) {
      transaction = await longPrompt('Enter the raw transaction in hex encoding', {
        required: true,
      })
    }

    const serialized = Buffer.from(transaction, 'hex')
    const raw = RawTransactionSerde.deserialize(serialized)

    const client = await this.sdk.connectRpc()

    if (!flags.confirm) {
      const confirm = await this.confirm(client, raw)

      if (!confirm) {
        this.exit(0)
      }
    }

    CliUx.ux.action.start(`Posting the transaction`)

    const response = await client.wallet.postTransaction({
      transaction,
      broadcast: flags.broadcast,
    })

    CliUx.ux.action.stop()

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

  async confirm(client: Pick<RpcClient, 'wallet'>, raw: RawTransaction): Promise<boolean> {
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

    return CliUx.ux.confirm('Do you want to post this (Y/N)?')
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
