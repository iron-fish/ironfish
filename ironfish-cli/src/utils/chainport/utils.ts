/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Logger } from '@ironfish/sdk'
import { CliUx } from '@oclif/core'
import axios from 'axios'
import { getNetworkConfig } from './config'
import {
  ChainportBridgeTransaction,
  ChainportNetwork,
  ChainportTransactionStatus,
  ChainportVerifiedToken,
} from './types'

export const getChainportTransactionStatus = async (networkId: number, hash: string) => {
  const config = getNetworkConfig(networkId)
  const url = `${config.endpoint}/api/port?base_tx_hash=${hash}&base_network_id=22`

  const response = await axios(url)
  const data = response.data as ChainportTransactionStatus

  return data
}

export const fetchChainportNetworks = async (networkId: number) => {
  const config = getNetworkConfig(networkId)
  const response: {
    data: {
      cp_network_ids: {
        [key: string]: ChainportNetwork
      }
    }
  } = await axios.get(`${config.endpoint}/meta`)

  return response.data.cp_network_ids
}

export const fetchChainportVerifiedTokens = async (networkId: number) => {
  const config = getNetworkConfig(networkId)

  const response: {
    data: { verified_tokens: ChainportVerifiedToken[] }
  } = await axios.get(`${config.endpoint}/token/list?network_name=IRONFISH`)
  return response.data.verified_tokens
}

export const fetchBridgeTransactionDetails = async (
  networkId: number,
  amount: bigint,
  to: string,
  network: ChainportNetwork,
  asset: ChainportVerifiedToken,
) => {
  const config = getNetworkConfig(networkId)
  const url = `${config.endpoint}/ironfish/metadata?raw_amount=${amount.toString()}&asset_id=${
    asset.web3_address
  }&target_network_id=${network.chainport_network_id.toString()}&target_web3_address=${to}`

  const response: {
    data: ChainportBridgeTransaction
  } = await axios.get(url)

  return response.data
}

export const showChainportTransactionSummary = async (
  hash: string,
  networkId: number,
  logger: Logger,
) => {
  CliUx.ux.action.start('Fetching transaction status on target network')
  const networks = await fetchChainportNetworks(networkId)
  const transactionStatus = await getChainportTransactionStatus(networkId, hash)
  CliUx.ux.action.stop()

  logger.debug(JSON.stringify(transactionStatus, null, 2))

  if (Object.keys(transactionStatus).length === 0 || !transactionStatus.target_network_id) {
    logger.log(
      `Transaction status not found on target network.

Note: Bridge transactions may take up to 30 minutes to surface on the target network.
If this issue persists, please contact chainport support: https://helpdesk.chainport.io/`,
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
\nTRANSACTION SUMMARY:
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
