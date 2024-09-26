/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { MAINNET } from '@ironfish/sdk'
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

  return await makeChainportRequest<ChainportTransactionStatus>(url)
}

export const fetchChainportNetworkMap = async (
  networkId: number,
): Promise<{ [key: string]: ChainportNetwork }> => {
  const config = getConfig(networkId)
  const url = `${config.endpoint}/meta`

  return (
    await makeChainportRequest<{ cp_network_ids: { [key: string]: ChainportNetwork } }>(url)
  ).cp_network_ids
}

export const fetchChainportVerifiedTokens = async (
  networkId: number,
): Promise<ChainportVerifiedToken[]> => {
  const config = getConfig(networkId)
  let url
  if (networkId === MAINNET.id) {
    url = `${config.endpoint}/token/list?network_name=IRONFISH`
  } else {
    url = `${config.endpoint}/token_list?network_name=IRONFISH`
  }

  return (await makeChainportRequest<{ verified_tokens: ChainportVerifiedToken[] }>(url))
    .verified_tokens
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

  return await makeChainportRequest<ChainportBridgeTransaction>(url)
}

const makeChainportRequest = async <T extends object>(url: string): Promise<T> => {
  const response = await axios
    .get<T>(url)
    .then((response) => {
      return response.data
    })
    .catch((error) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const chainportError = error.response?.data?.error?.description as string
      if (chainportError) {
        throw new Error(chainportError)
      } else {
        throw new Error('Chainport error - ' + error)
      }
    })

  return response
}
