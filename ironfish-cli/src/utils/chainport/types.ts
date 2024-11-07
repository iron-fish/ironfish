/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// This file contains response types for chainport requests

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
    source_token_fee_amount: string
    portx_fee_amount: string
    is_portx_fee_payment: boolean
  }
}

export type ChainportNetwork = {
  chainport_network_id: number
  explorer_url: string
  label: string
  network_icon: string
}

export type ChainportToken = {
  id: number
  decimals: number
  name: string
  pinned: boolean
  web3_address: string
  symbol: string
  token_image: string
  chain_id: number | null
  network_name: string
  network_id: number
  blockchain_type: string
  is_stable: boolean
  is_lifi: boolean
}

export type ChainportTokenWithNetwork = {
  network: ChainportNetwork
  token: ChainportToken
}

export type ChainportTransactionStatus =
  | Record<string, never> // empty object
  | {
      base_network_id: number | null
      base_tx_hash: string | null
      base_tx_status: number | null
      base_token_address: string | null
      target_network_id: number | null
      target_tx_hash: string | null
      target_tx_status: number | null
      target_token_address: string | null
      created_at: string | null
      port_in_ack: boolean | null
    }
