/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { TESTNET, TransactionStatus } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'
import {
  fetchChainportNetworks,
  getChainportTransactionStatus,
  isIncomingChainportBridgeTransaction,
  isOutgoingChainportBridgeTransaction,
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

    let response = await client.wallet.getAccountTransaction({
      account,
      hash,
    })

    if (!response.content.transaction) {
      this.log(`No transaction found by hash ${hash}`)
      return
    }

    const isOutgoingBridgeTransaction = isOutgoingChainportBridgeTransaction(
      networkId,
      response.content.transaction,
    )
    const isIncomingBridgeTransaction = isIncomingChainportBridgeTransaction(
      networkId,
      response.content.transaction,
    )

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
      response = await client.wallet.getAccountTransaction({
        account,
        hash,
      })
    } else {
      this.log(`Transaction status on Ironfish: ${response.content.transaction.status}`)
    }

    if (response.content.transaction?.status !== TransactionStatus.CONFIRMED) {
      this.log(`Transaction not confirmed on Ironfish`)
      return
    }

    CliUx.ux.action.start('Fetching transaction status on target network')
    const transactionStatus = await getChainportTransactionStatus(networkId, hash)
    CliUx.ux.action.stop()

    this.logger.debug(JSON.stringify(transactionStatus, null, 2))

    if (Object.keys(transactionStatus).length === 0) {
      this.log(
        `Transaction status not found on target network.

Note: Bridge transactions may take up to 30 minutes to surface on the target network.
If this issue persists, please contact chainport support: https://app.chainport.io/`,
      )
      return
    }

    if (
      isOutgoingBridgeTransaction &&
      transactionStatus.target_tx_hash &&
      transactionStatus.target_network_id
    ) {
      const networks = await fetchChainportNetworks(networkId)

      const targetNetwork = networks[transactionStatus.target_network_id]

      if (!targetNetwork) {
        // This ~should~ not happen
        this.error('Target network not supported')
      }

      let summary = `\
\nTRANSACTION STATUS:
Direction                    Outgoing
Ironfish Network             ${networkId === 0 ? 'Testnet' : 'Mainnet'}
`

      if (response.content.transaction) {
        summary += `Ironfish Transaction Status  ${response.content.transaction.status}
`
      }

      summary += `Source Transaction Hash      ${hash}
Target Network               ${targetNetwork.name}
Target Transaction Hash      ${transactionStatus.target_tx_hash}
Explorer URL                 ${
        targetNetwork.explorer_url + 'tx/' + transactionStatus.target_tx_hash
      }  
      `
      this.log(summary)
    }
  }
}
