/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { MAINNET, RpcWalletTransaction, TESTNET, TransactionType } from '@ironfish/sdk'
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

export type ChainportTransactionStatus = {
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

const ENDPOINTS = {
  [TESTNET.id]: 'https://preprod-api.chainport.io',
  [MAINNET.id]: 'https://api.chainport.io',
}

export const getChainportTransactionStatus = async (network_id: number, hash: string) => {
  const url = `${ENDPOINTS[network_id]}/api/port?base_tx_hash=${hash}&base_network_id=22`

  const response = await axios(url)
  const data = response.data as ChainportTransactionStatus

  return data
}

export const fetchChainportNetworks = async (network_id: number) => {
  const response: {
    data: {
      cp_network_ids: {
        [key: string]: ChainportNetwork
      }
    }
  } = await axios.get(`${ENDPOINTS[network_id]}/meta`)

  return response.data.cp_network_ids
}

export const fetchChainportVerifiedTokens = async (network_id: number) => {
  const response: {
    data: { verified_tokens: ChainportVerifiedToken[] }
  } = await axios.get(`${ENDPOINTS[network_id]}/token/list?network_name=IRONFISH`)
  return response.data.verified_tokens
}

export const fetchBridgeTransactionDetails = async (
  networkId: number,
  amount: bigint,
  assetId: string,
  to: string,
  selectedNetwork: string,
) => {
  const url = `${
    ENDPOINTS[networkId]
  }/ironfish/metadata?raw_amount=${amount.toString()}&asset_id=${assetId}&target_network_id=${selectedNetwork}&target_web3_address=${to}`

  const response: {
    data: ChainportBridgeTransaction
  } = await axios.get(url)

  return response.data
}

export const isIncomingChainportBridgeTransaction = (transaction: RpcWalletTransaction) => {
  if (transaction.type !== TransactionType.RECEIVE) {
    return false
  }

  if (!transaction.notes) {
    return false
  }

  for (const note of transaction.notes) {
    if (
      note.sender.toLowerCase() !==
      '06102d319ab7e77b914a1bd135577f3e266fd82a3e537a02db281421ed8b3d13'.toLowerCase()
    ) {
      return false
    }
  }

  return true
}

export const isOutgoingChainportBridgeTransaction = (transaction: RpcWalletTransaction) => {
  if (transaction.type !== TransactionType.SEND) {
    return false
  }

  if (!transaction.notes) {
    return false
  }

  if (transaction.notes.length < 2) {
    return false
  }

  const bridgeAddresses = [
    '06102d319ab7e77b914a1bd135577f3e266fd82a3e537a02db281421ed8b3d13'.toLowerCase(),
    'db2cf6ec67addde84cc1092378ea22e7bb2eecdeecac5e43febc1cb8fb64b5e5'.toLowerCase(),
    '3bE494deb669ff8d943463bb6042eabcf0c5346cf444d569e07204487716cb85'.toLowerCase(),
  ]

  const bridgeNote = transaction.notes.find((note) =>
    bridgeAddresses.includes(note.owner.toLowerCase()),
  )

  if (!bridgeNote) {
    return false
  }

  const feeNote = transaction.notes.find((note) => note.memo === '{"type": "fee_payment"}')

  if (!feeNote) {
    return false
  }

  return true
}
