/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import axios from 'axios'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'
import { fetchChainportNetworks } from '../../../utils/chainport'

type ChainportTransactionStatus = {
  base_network_id?: number
  base_tx_hash?: string
  base_tx_status?: number
  base_token_address?: string
  target_network_id?: number
  target_tx_hash?: string
  target_tx_status?: number
  target_token_address?: string
  created_at?: string
  port_in_ack?: boolean
}

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
    const { args } = await this.parse(StatusCommand)
    const hash = args.hash as string

    // TODO: Add test to check whether a transaction is a bridge transaction sent by this account.
    // If it is not a bridge transaction, return early with a message.

    const url = `https://preprod-api.chainport.io/api/port?base_tx_hash=${hash}&base_network_id=22`

    this.logger.debug(`Checking status of transaction ${hash}...`)
    this.logger.debug(`GET ${url}`)

    const response = await axios(url)
    const data = response.data as ChainportTransactionStatus

    this.logger.debug(JSON.stringify(data, null, 2))

    if (Object.keys(data).length === 0) {
      this.log(`Source transaction has not reached the minimum number of confirmations yet.`)
      this.log(
        `You can use ironfish wallet:transaction to check the status of the transaction on Ironfish.`,
      )
      return
    }

    if (data.target_tx_hash && data.target_network_id) {
      this.log('\nTransaction status on target network:')
      const networks = await fetchChainportNetworks()

      const targetNetwork = networks[data.target_network_id]

      if (!targetNetwork) {
        // This ~should~ not happen
        this.error('Target network not supported')
      }

      this.log(`Target network: ${targetNetwork.name}`)

      this.log(`Target transaction hash: ${data.target_tx_hash}`)

      this.log(
        `You can view the transaction status here: ${
          targetNetwork.explorer_url + 'tx/' + data.target_tx_hash
        }`,
      )
    }
  }
}
