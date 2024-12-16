/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import axios from 'axios'
import { getConfig } from './config'
import {
  ChainportBridgeTransaction,
  ChainportNetwork,
  ChainportToken,
  ChainportTokenWithNetwork,
  ChainportTransactionStatus,
} from './types'

// Wrappers around chainport API requests. Documentation here: https://docs.chainport.io/for-developers/integrate-chainport/iron-fish/iron-fish-to-evm

export const fetchChainportTransactionStatus = async (
  networkId: number,
  hash: string,
): Promise<ChainportTransactionStatus> => {
  const config = getConfig(networkId)
  const url = new URL(`/bridges/transactions/status`, config.endpoint)
  url.searchParams.append('hash', hash)

  return await makeChainportRequest<ChainportTransactionStatus>(url.toString())
}

export const fetchChainportNetworks = async (
  networkId: number,
): Promise<ChainportNetwork[]> => {
  const config = getConfig(networkId)
  const url = new URL('/bridges/networks', config.endpoint).toString()

  return (await makeChainportRequest<{ data: ChainportNetwork[] }>(url)).data
}

export const fetchChainportTokens = async (networkId: number): Promise<ChainportToken[]> => {
  const config = getConfig(networkId)
  const url = new URL('/bridges/tokens', config.endpoint).toString()

  return (await makeChainportRequest<{ data: ChainportToken[] }>(url)).data
}

export const fetchChainportTokenPaths = async (
  networkId: number,
  tokenId: number,
): Promise<ChainportTokenWithNetwork[]> => {
  const config = getConfig(networkId)
  const url = new URL(`/bridges/tokens/${tokenId}/networks`, config.endpoint)
  url.searchParams.append('with_tokens', true.toString())
  return (await makeChainportRequest<{ data: ChainportTokenWithNetwork[] }>(url.toString()))
    .data
}

export const fetchChainportBridgeTransaction = async (
  networkId: number,
  amount: bigint,
  assetId: string,
  targetNetworkId: number,
  targetAddress: string,
): Promise<ChainportBridgeTransaction> => {
  const config = getConfig(networkId)
  const url = new URL(`/bridges/transactions/create`, config.endpoint)
  url.searchParams.append('amount', amount.toString())
  url.searchParams.append('asset_id', assetId)
  url.searchParams.append('target_network_id', targetNetworkId.toString())
  url.searchParams.append('target_address', targetAddress.toString())

  return await makeChainportRequest<ChainportBridgeTransaction>(url.toString())
}

const makeChainportRequest = async <T extends object>(url: string): Promise<T> => {
  const response = await axios
    .get<T>(url)
    .then((response) => {
      return response.data
    })
    .catch((error) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const apiError = error.response?.data?.message as string
      if (apiError) {
        throw new Error('Chainport error: ' + apiError)
      } else {
        throw new Error('Chainport error: ' + error)
      }
    })

  return response
}
