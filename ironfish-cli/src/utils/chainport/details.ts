/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { RpcWalletTransaction, TESTNET, TransactionType } from '@ironfish/sdk'
import { getNetworkConfig } from './config'
import { ChainportMemoMetadata } from './metadata'
import { ChainportNetwork } from './types'

export const getChainportTransactionDetails = (
  networkId: number,
  transaction: RpcWalletTransaction,
  networks: { [key: string]: ChainportNetwork } | undefined = undefined,
): {
  isChainportTransaction: boolean
  details?: {
    network: string
    address: string
  }
} => {
  // This condition will be removed when we enable mainnet
  if (networkId !== TESTNET.id) {
    return {
      isChainportTransaction: false,
    }
  }

  const config = getNetworkConfig(networkId)

  if (![TransactionType.RECEIVE, TransactionType.SEND].includes(transaction.type)) {
    return {
      isChainportTransaction: false,
    }
  }

  return transaction.type === TransactionType.RECEIVE
    ? isIncomingChainportBridgeTransaction(transaction, config, networks)
    : isOutgoingChainportBridgeTransaction(transaction, config, networks)
}

const isIncomingChainportBridgeTransaction = (
  transaction: RpcWalletTransaction,
  config: { incomingAddresses: string[] },
  networks: { [key: string]: ChainportNetwork } | undefined = undefined,
) => {
  if (!transaction.notes || transaction.notes.length < 1) {
    return {
      isChainportTransaction: false,
    }
  }

  const bridgeNote = transaction.notes[0]

  const incomingAddresses = config.incomingAddresses

  if (
    !incomingAddresses.find(
      (address) => address.toLowerCase() === bridgeNote.sender.toLowerCase(),
    )
  ) {
    return {
      isChainportTransaction: false,
    }
  }

  if (!networks) {
    return {
      isChainportTransaction: true,
    }
  }

  const [sourceNetwork, address, _] = ChainportMemoMetadata.decode(
    Buffer.from(bridgeNote.memoHex).toString(),
  )

  if (!networks[sourceNetwork]) {
    return {
      isChainportTransaction: true,
    }
  }

  return {
    isChainportTransaction: true,
    details: {
      network: networks[sourceNetwork].name || 'Unknown',
      address: address,
    },
  }
}

const isOutgoingChainportBridgeTransaction = (
  transaction: RpcWalletTransaction,
  config: { outgoingAddresses: string[] },
  networks: { [key: string]: ChainportNetwork } | undefined = undefined,
) => {
  if (!transaction.notes || transaction.notes.length < 2) {
    return {
      isChainportTransaction: false,
    }
  }

  if (!transaction.notes.find((note) => note.memo === '{"type": "fee_payment"}')) {
    return {
      isChainportTransaction: false,
    }
  }

  const bridgeNote = transaction.notes.find((note) =>
    config.outgoingAddresses
      .map((address) => address.toLowerCase())
      .includes(note.owner.toLowerCase()),
  )

  if (!bridgeNote) {
    return {
      isChainportTransaction: false,
    }
  }

  if (!networks) {
    return {
      isChainportTransaction: true,
    }
  }

  const [sourceNetwork, address, _] = ChainportMemoMetadata.decode(
    Buffer.from(bridgeNote.memoHex).toString(),
  )

  if (!networks[sourceNetwork]) {
    return {
      isChainportTransaction: true,
    }
  }

  return {
    isChainportTransaction: true,
    details: {
      network: networks[sourceNetwork].name || 'Unknown',
      address: address,
    },
  }
}
