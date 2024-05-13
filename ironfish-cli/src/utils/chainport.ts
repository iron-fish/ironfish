/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import axios from 'axios'

export type ChainportBridgeTransaction = {
  bridge_output: {
    publicAddress: string
    amount: string
    memoHex: string
    assetId: string
  }
  gas_fee_output: {
    publicAddress: string
    amount: string
    memo: string
  }
  bridge_fee: {
    source_token_fee_amount: number | null
    portx_fee_amount: number
    is_portx_fee_payment: boolean
  }
}

export type ChainportNetwork = {
  chainport_network_id: number
  shortname: string
  name: string
  chain_id: number
  explorer_url: string
  label: string
  blockchain_type: string
  native_token_symbol: string
  network_icon: string
}

export type ChainportVerifiedToken = {
  decimals: number
  id: number
  name: string
  pinned: boolean
  web3_address: string
  symbol: string
  token_image: string
  target_networks: number[]
  chain_id: number | null
  network_name: string
  network_id: number
  blockchain_type: string
  is_stable: boolean
  is_lifi: boolean
}

export const fetchChainportNetworks = async () => {
  const response: {
    data: {
      cp_network_ids: {
        [key: string]: ChainportNetwork
      }
    }
  } = await axios.get('https://preprod-api.chainport.io/meta')

  return response.data.cp_network_ids
}

export const fetchChainportVerifiedTokens = async () => {
  const response: {
    data: { verified_tokens: ChainportVerifiedToken[] }
  } = await axios.get('https://preprod-api.chainport.io/token/list?network_name=IRONFISH')
  return response.data.verified_tokens
}

export const fetchBridgeTransactionDetails = async (
  amount: bigint,
  assetId: string,
  to: string,
  selectedNetwork: string,
) => {
  const url = `https://preprod-api.chainport.io/ironfish/metadata?raw_amount=${amount.toString()}&asset_id=${assetId}&target_network_id=${selectedNetwork}&target_web3_address=${to}`

  const response: {
    data: ChainportBridgeTransaction
  } = await axios.get(url)

  return response.data
}
