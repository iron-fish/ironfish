/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { RpcWalletTransaction, TransactionType } from '@ironfish/sdk'
import { getConfig } from './config'
import { ChainportMemoMetadata } from './metadata'

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
