/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { TESTNET } from '@ironfish/sdk'
import { CliUx } from '@oclif/core'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'
import {
  fetchChainportNetworks,
  getChainportTransactionStatus,
  isIncomingChainportBridgeTransaction,
  isOutgoingChainportBridgeTransaction,
} from '../../../utils/chainport'

export class StatusCommand extends IronfishCommand {
  static description = `Display the status of an outgoing chainport bridge transaction`
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
    const networkId = (await client.chain.getNetworkInfo()).content.networkId

    if (networkId !== TESTNET.id) {
      this.error(`Chainport transactions are only available on testnet.`)
    }

    const response = await client.wallet.getAccountTransaction({
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

    this.log(`Transaction status on Ironfish: ${response.content.transaction.status}`)

    if (isIncomingBridgeTransaction) {
      this.log(`This transaction is an incoming chainport bridge transaction`)
      // TODO: Add support for incoming chainport bridge transactions
      // This involved decoding the memohex to get the source network id and transaction hash
      return
    }

    CliUx.ux.action.start('Fetching target network status')
    const transactionStatus = await getChainportTransactionStatus(networkId, hash)

    this.logger.debug(JSON.stringify(transactionStatus, null, 2))

    if (Object.keys(transactionStatus).length === 0) {
      this.log(`Source transaction has not reached the minimum number of confirmations yet.`)
      this.log(
        `You can use ironfish wallet:transaction to check the status of the transaction on Ironfish.`,
      )
      CliUx.ux.action.stop()
      return
    }

    if (
      isOutgoingBridgeTransaction &&
      transactionStatus.target_tx_hash &&
      transactionStatus.target_network_id
    ) {
      const networks = await fetchChainportNetworks(networkId)
      CliUx.ux.action.stop()

      const targetNetwork = networks[transactionStatus.target_network_id]

      if (!targetNetwork) {
        // This ~should~ not happen
        this.error('Target network not supported')
      }

      const summary = `\
\nTRANSACTION STATUS:
Direction                    Outgoing
Ironfish Network             ${networkId === 0 ? 'Testnet' : 'Mainnet'}
Source Transaction Hash      ${hash}
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
