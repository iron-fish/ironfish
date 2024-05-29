/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { TESTNET, TransactionStatus } from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'
import {
  incomingBridgeTransactionDetails,
  isOutgoingChainportBridgeTransaction,
  showChainportTransactionSummary,
} from '../../../utils/chainport'
import { watchTransaction } from '../../../utils/transaction'

export class TransactionCommand extends IronfishCommand {
  static description = `Display the status of a chainport bridge transaction`
  static hidden = true

  static flags = {
    ...RemoteFlags,
    watch: Flags.boolean({
      default: false,
      description: 'Wait for the transaction to be confirmed',
    }),
  }

  static args = [
    {
      name: 'hash',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: true,
      description: 'Hash of the transaction',
    },
    {
      name: 'account',
      required: false,
      description: 'Name of the account',
    },
  ]

  async start(): Promise<void> {
    const client = await this.sdk.connectRpc()
    const { flags, args } = await this.parse(TransactionCommand)
    const hash = args.hash as string
    const account = args.account as string | undefined
    const networkId = (await client.chain.getNetworkInfo()).content.networkId

    if (networkId !== TESTNET.id) {
      this.error(`Chainport transactions are only available on testnet.`)
    }

    let transaction = (
      await client.wallet.getAccountTransaction({
        account,
        hash,
      })
    ).content.transaction

    if (!transaction) {
      this.log(`No transaction found by hash ${hash}`)
      return
    }

    const isOutgoingBridgeTransaction = isOutgoingChainportBridgeTransaction(
      networkId,
      transaction,
    ).isOutgoingTransaction
    const isIncomingBridgeTransaction = incomingBridgeTransactionDetails(
      networkId,
      transaction,
    ).isIncomingTransaction

    if (!isOutgoingBridgeTransaction && !isIncomingBridgeTransaction) {
      this.log(`This transaction is not a chainport bridge transaction`)

      return
    }

    if (isIncomingBridgeTransaction) {
      this.log(`This transaction is an incoming chainport bridge transaction`)
      // TODO: Add support for incoming chainport bridge transactions
      // This involved decoding the memohex to get the source network id and transaction hash
      return
    }

    if (flags.watch) {
      await watchTransaction({
        client,
        logger: this.logger,
        account,
        hash,
      })

      transaction = (
        await client.wallet.getAccountTransaction({
          account,
          hash,
        })
      ).content.transaction
    } else {
      this.log(`Transaction status on Ironfish: ${transaction.status}`)
    }

    if (transaction?.status !== TransactionStatus.CONFIRMED) {
      this.log(`Transaction not confirmed on Ironfish`)
      return
    }

    await showChainportTransactionSummary(transaction.hash, networkId, this.logger)
  }
}
