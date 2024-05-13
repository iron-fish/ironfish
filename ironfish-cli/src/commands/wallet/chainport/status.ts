/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { TESTNET } from '@ironfish/sdk'
import { CliUx } from '@oclif/core'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'
import { fetchChainportNetworks, getChainportTransactionStatus } from '../../../utils/chainport'

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

    // TODO: Add test to check whether a transaction is a bridge transaction sent by this account.
    // If it is not a bridge transaction, return early with a message.

    const networkId = (await client.chain.getNetworkInfo()).content.networkId

    if (networkId !== TESTNET.id) {
      CliUx.ux.error('This command is only available on testnet')
    }

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
