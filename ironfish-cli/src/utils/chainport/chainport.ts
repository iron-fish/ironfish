/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  Logger,
  MAINNET,
  RpcWalletNote,
  RpcWalletTransaction,
  TESTNET,
  TransactionType,
} from '@ironfish/sdk'
import { CliUx } from '@oclif/core'
import axios from 'axios'
import { ChainportMemoMetadata } from './metadata'

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

const config = {
  [TESTNET.id]: {
    endpoint: 'https://preprod-api.chainport.io',
    outgoingAddresses: [
      '06102d319ab7e77b914a1bd135577f3e266fd82a3e537a02db281421ed8b3d13',
      'db2cf6ec67addde84cc1092378ea22e7bb2eecdeecac5e43febc1cb8fb64b5e5',
      '3bE494deb669ff8d943463bb6042eabcf0c5346cf444d569e07204487716cb85',
    ],
    incomingAddresses: ['06102d319ab7e77b914a1bd135577f3e266fd82a3e537a02db281421ed8b3d13'],
  },
  [MAINNET.id]: {
    endpoint: 'https://api.chainport.io',
    outgoingAddresses: [],
    incomingAddresses: [],
  },
}

const getNetworkConfig = (networkId: number) => {
  if (networkId !== TESTNET.id && networkId !== MAINNET.id) {
    throw new Error(`Unsupported network ${networkId} for chainport`)
  }

  if (networkId === MAINNET.id) {
    throw new Error(`Mainnet is not yet supported.`)
  }

  return config[networkId]
}

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

export const incomingBridgeTransactionDetails = (
  networkId: number,
  transaction: RpcWalletTransaction,
  networks: { [key: string]: ChainportNetwork } | undefined = undefined,
): {
  isIncomingTransaction: boolean
  details?: {
    network: string
    address: string
  }
} => {
  if (
    networkId !== TESTNET.id ||
    transaction.type !== TransactionType.RECEIVE ||
    !transaction.notes
  ) {
    return {
      isIncomingTransaction: false,
    }
  }

  const config = getNetworkConfig(networkId)

  let bridgeNote: RpcWalletNote | undefined = undefined

  for (const note of transaction.notes) {
    const incomingAddresses = config.incomingAddresses
    if (
      note.sender.toLowerCase() !==
      incomingAddresses.find((address) => address.toLowerCase() === note.sender.toLowerCase())
    ) {
      return {
        isIncomingTransaction: false,
      }
    }
    bridgeNote = note
  }

  if (!bridgeNote) {
    return {
      isIncomingTransaction: false,
    }
  }

  if (!networks) {
    return {
      isIncomingTransaction: true,
    }
  }

  const [sourceNetwork, address, _] = ChainportMemoMetadata.decode(
    Buffer.from(bridgeNote?.memoHex).toString(),
  )

  if (!networks[sourceNetwork]) {
    return {
      isIncomingTransaction: true,
    }
  }

  return {
    isIncomingTransaction: true,
    details: {
      network: networks[sourceNetwork].name || 'Unknown',
      address: address,
    },
  }
}

export const isOutgoingChainportBridgeTransaction = (
  networkId: number,
  transaction: RpcWalletTransaction,
  networks: { [key: string]: ChainportNetwork } | undefined = undefined,
): {
  isOutgoingTransaction: boolean
  details?: {
    network: string
    address: string
  }
} => {
  if (
    networkId !== TESTNET.id ||
    transaction.type !== TransactionType.SEND ||
    !transaction.notes ||
    transaction.notes.length < 2
  ) {
    return {
      isOutgoingTransaction: false,
    }
  }

  const config = getNetworkConfig(networkId)

  const bridgeAddresses = config.outgoingAddresses.map((address) => address.toLowerCase())

  const bridgeNote = transaction.notes.find((note) =>
    bridgeAddresses.includes(note.owner.toLowerCase()),
  )

  if (!bridgeNote) {
    return {
      isOutgoingTransaction: false,
    }
  }

  const feeNote = transaction.notes.find((note) => note.memo === '{"type": "fee_payment"}')

  if (!feeNote) {
    return {
      isOutgoingTransaction: false,
    }
  }

  if (!networks) {
    return {
      isOutgoingTransaction: true,
    }
  }

  const [sourceNetwork, address, _] = ChainportMemoMetadata.decode(
    Buffer.from(bridgeNote.memoHex).toString(),
  )

  if (!networks[sourceNetwork]) {
    return {
      isOutgoingTransaction: true,
    }
  }

  return {
    isOutgoingTransaction: true,
    details: {
      network: networks[sourceNetwork].name || 'Unknown',
      address: address,
    },
  }
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
