/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import axios from 'axios'
import { getConfig } from './config'
import {
  ChainportBridgeTransaction,
  ChainportNetwork,
  ChainportTransactionStatus,
  ChainportVerifiedToken,
} from './types'

// Wrappers around chainport API requests. Documentation here: https://docs.chainport.io/for-developers/integrate-chainport/iron-fish/iron-fish-to-evm

export const fetchChainportTransactionStatus = async (
  networkId: number,
  hash: string,
): Promise<ChainportTransactionStatus> => {
  const config = getConfig(networkId)
  const url = `${config.endpoint}/api/port?base_tx_hash=${hash}&base_network_id=${config.chainportId}`

  const response: {
    data: ChainportTransactionStatus
  } = await axios.get(url)

  return response.data
}

export const fetchChainportNetworkMap = async (
  networkId: number,
): Promise<{ [key: string]: ChainportNetwork }> => {
  const config = getConfig(networkId)
  const response: {
    data: {
      cp_network_ids: {
        [key: string]: ChainportNetwork
      }
    }
  } = await axios.get(`${config.endpoint}/meta`)

  return response.data.cp_network_ids
}

export const fetchChainportVerifiedTokens = async (
  networkId: number,
): Promise<ChainportVerifiedToken[]> => {
  const config = getConfig(networkId)

  const response: {
    data: { verified_tokens: ChainportVerifiedToken[] }
  } = await axios.get(`${config.endpoint}/token/list?network_name=IRONFISH`)

  return response.data.verified_tokens
}

export const fetchChainportBridgeTransaction = async (
  networkId: number,
  amount: bigint,
  to: string,
  network: ChainportNetwork,
  asset: ChainportVerifiedToken,
): Promise<ChainportBridgeTransaction> => {
  const config = getConfig(networkId)
  const url = `${config.endpoint}/ironfish/metadata?raw_amount=${amount.toString()}&asset_id=${
    asset.web3_address
  }&target_network_id=${network.chainport_network_id.toString()}&target_web3_address=${to}`

  const response: {
    data: ChainportBridgeTransaction
  } = await axios.get(url)

  return response.data
}
