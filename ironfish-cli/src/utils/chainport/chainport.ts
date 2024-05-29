/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Logger } from '@ironfish/sdk'
import { CliUx } from '@oclif/core'
import { fetchChainportNetworkMap, fetchChainportTransactionStatus } from './requests'

export const showChainportTransactionSummary = async (
  hash: string,
  networkId: number,
  logger: Logger,
) => {
  CliUx.ux.action.start('Fetching transaction status on target network')
  const networks = await fetchChainportNetworkMap(networkId)
  const transactionStatus = await fetchChainportTransactionStatus(networkId, hash)
  CliUx.ux.action.stop()

  logger.debug(JSON.stringify(transactionStatus, null, 2))

  if (Object.keys(transactionStatus).length === 0 || !transactionStatus.target_network_id) {
    logger.log(
      `Transaction status not found on target network.

Note: Bridge transactions may take up to 30 minutes to surface on the target network.
If this issue persists, please contact chainport support: https://app.chainport.io/`,
    )
    return
  }

  const targetNetwork = networks[transactionStatus.target_network_id]

  if (!targetNetwork) {
    // This ~should~ not happen
    logger.error('Target network not supported')
    return
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

  logger.log(summary)
}
