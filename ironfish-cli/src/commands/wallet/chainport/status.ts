/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'
import {
  fetchChainportNetworks,
  getChainportTransactionStatus,
  isIncomingChainportBridgeTransaction,
  isOutgoingChainportBridgeTransaction,
} from '../../../utils/chainport'

export class StatusCommand extends IronfishCommand {
  static description = `Display an account transaction`
  static hidden = true

  static flags = {
    ...RemoteFlags,
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
    const { args } = await this.parse(StatusCommand)
    const hash = args.hash as string
    const account = args.account as string | undefined

    const response = await client.wallet.getAccountTransaction({
      account,
      hash,
    })

    if (!response.content.transaction) {
      this.log(`No transaction found by hash ${hash}`)
      return
    }

    const networkId = (await client.chain.getNetworkInfo()).content.networkId

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

    this.log(`Transaction status on Ironfish: ${response.content.transaction.status}`)

    const transactionStatus = await getChainportTransactionStatus(networkId, hash)

    this.logger.debug(JSON.stringify(transactionStatus, null, 2))

    if (Object.keys(transactionStatus).length === 0) {
      this.log(`Source transaction has not reached the minimum number of confirmations yet.`)
      this.log(
        `You can use ironfish wallet:transaction to check the status of the transaction on Ironfish.`,
      )
      return
    }

    if (transactionStatus.target_tx_hash && transactionStatus.target_network_id) {
      this.log('\nTransaction status on target network:')
      const networks = await fetchChainportNetworks(networkId)

      const targetNetwork = networks[transactionStatus.target_network_id]

      if (!targetNetwork) {
        // This ~should~ not happen
        this.error('Target network not supported')
      }

      this.log(`Direction: ${isOutgoingBridgeTransaction ? 'Outgoing' : 'Incoming'}`)

      this.log(`Target network: ${targetNetwork.name}`)

      this.log(`Target transaction hash: ${transactionStatus.target_tx_hash}`)

      this.log(
        `You can view the transaction status here: ${
          targetNetwork.explorer_url + 'tx/' + transactionStatus.target_tx_hash
        }`,
      )
    }
  }
}
