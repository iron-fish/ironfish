/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Logger, RpcWalletTransaction, TransactionType } from '@ironfish/sdk'
import { CliUx } from '@oclif/core'
import { getConfig } from './config'
import { ChainportMemoMetadata } from './metadata'
import { fetchChainportNetworkMap, fetchChainportTransactionStatus } from './requests'

type ChainportTransactionData =
  | {
      type: TransactionType.SEND | TransactionType.RECEIVE
      chainportNetworkId: number
      address: string
    }
  | undefined

export const extractChainportDataFromTransaction = (
  networkId: number,
  transaction: RpcWalletTransaction,
): ChainportTransactionData => {
  console.log('extractChainportDataFromTransaction')
  const config = getConfig(networkId)

  if (transaction.type === TransactionType.SEND) {
    return getOutgoingChainportTransactionData(transaction, config)
  }
  if (transaction.type === TransactionType.RECEIVE) {
    return getIncomingChainportTransactionData(transaction, config)
  }
  return undefined
}

const getIncomingChainportTransactionData = (
  transaction: RpcWalletTransaction,
  config: { incomingAddresses: Set<string> },
): ChainportTransactionData => {
  const bridgeNote = transaction.notes?.[0]

  if (!bridgeNote || !isAddressInSet(bridgeNote.sender, config.incomingAddresses)) {
    return undefined
  }

  const [sourceNetwork, address, _] = ChainportMemoMetadata.decode(bridgeNote.memoHex)

  return {
    type: TransactionType.RECEIVE,
    chainportNetworkId: sourceNetwork,
    address: address,
  }
}

const getOutgoingChainportTransactionData = (
  transaction: RpcWalletTransaction,
  config: { outgoingAddresses: Set<string> },
): ChainportTransactionData => {
  if (!transaction.notes || transaction.notes.length < 2) {
    return undefined
  }

  if (!transaction.notes.find((note) => note.memo === '{"type": "fee_payment"}')) {
    return undefined
  }

  const bridgeNote = transaction.notes.find((note) => {
    return isAddressInSet(note.owner, config.outgoingAddresses)
  })

  if (!bridgeNote) {
    return undefined
  }

  const [sourceNetwork, address, _] = ChainportMemoMetadata.decode(bridgeNote.memoHex)

  return {
    type: TransactionType.SEND,
    chainportNetworkId: sourceNetwork,
    address: address,
  }
}

const isAddressInSet = (address: string, addressSet: Set<string>): boolean => {
  return addressSet.has(address.toLowerCase())
}

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
