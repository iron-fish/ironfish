/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Logger, RpcWalletTransaction, TransactionStatus, TransactionType } from '@ironfish/sdk'
import { ux } from '@oclif/core'
import { getConfig, isNetworkSupportedByChainport } from './config'
import { ChainportMemoMetadata } from './metadata'
import { fetchChainportTransactionStatus } from './requests'
import { ChainportNetwork, ChainportTransactionStatus } from './types'

export type ChainportTransactionData =
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
  if (isNetworkSupportedByChainport(networkId) === false) {
    return undefined
  }

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

  const bridgeNote = transaction.notes.find((note) =>
    isAddressInSet(note.owner, config.outgoingAddresses),
  )

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

export const displayChainportTransactionSummary = async (
  networkId: number,
  transaction: RpcWalletTransaction,
  data: ChainportTransactionData,
  network: ChainportNetwork | undefined,
  logger: Logger,
) => {
  if (!data) {
    return
  }

  // Chainport does not give us a way to determine the source transaction hash of an incoming bridge transaction
  // So we can only display the source network and address
  if (data.type === TransactionType.RECEIVE) {
    logger.log(`
Direction:                    Incoming
Source Network:               ${network?.label ?? 'Error fetching network details'}
       Address:               ${data.address}
       Explorer Account:      ${
         network
           ? new URL('address/' + data.address, network.explorer_url).toString()
           : 'Error fetching network details'
       }`)

    return
  }

  const basicInfo = `
Direction:                    Outgoing
Target Network:               ${network?.label ?? 'Error fetching network details'}
       Address:               ${data.address}
       Explorer Account:      ${
         network
           ? new URL('address/' + data.address, network.explorer_url).toString()
           : 'Error fetching network details'
       }`

  // We'll wait to show the transaction status if the transaction is still pending on Iron Fish
  if (transaction.status !== TransactionStatus.CONFIRMED) {
    logger.log(basicInfo)
    logger.log(`       Transaction Status:    ${transaction.status} (Iron Fish)`)
    return
  }

  ux.action.start('Fetching transaction information on target network')
  let transactionStatus: ChainportTransactionStatus | undefined
  try {
    transactionStatus = await fetchChainportTransactionStatus(networkId, transaction.hash)
    ux.action.stop()
  } catch (e: unknown) {
    ux.action.stop('error')

    if (e instanceof Error) {
      logger.debug(e.message)
    }
  }

  logger.log(basicInfo)

  if (!transactionStatus) {
    logger.log(`       Transaction Status:    Error fetching transaction details`)
    return
  }

  // States taken from https://docs.chainport.io/for-developers/api-reference/port
  if (Object.keys(transactionStatus).length === 0 || !transactionStatus.base_tx_status) {
    logger.log(`       Transaction Status:    Pending confirmation (Iron Fish)`)
    return
  }

  if (
    transactionStatus.base_tx_hash &&
    transactionStatus.base_tx_status === 1 &&
    !transactionStatus.target_tx_hash
  ) {
    logger.log(`       Transaction Status:    Pending creation (target network)`)
    return
  }

  logger.log(
    `       Transaction Status:    ${
      transactionStatus.target_tx_status === 1
        ? 'Completed'
        : 'Pending confirmation (target network)'
    }`,
  )
  logger.log(`       Transaction Hash:      ${transactionStatus.target_tx_hash}
       Explorer Transaction:  ${
         network
           ? new URL('address/' + data.address, network.explorer_url).toString()
           : 'Error fetching network details'
       }`)
}
