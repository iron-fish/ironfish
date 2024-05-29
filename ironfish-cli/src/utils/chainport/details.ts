/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { RpcWalletNote, RpcWalletTransaction, TESTNET, TransactionType } from '@ironfish/sdk'
import { getNetworkConfig } from './chainport'
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

  if (!transaction.notes) {
    return {
      isChainportTransaction: false,
    }
  }

  const config = getNetworkConfig(networkId)

  if (transaction.type === TransactionType.RECEIVE) {
    let bridgeNote: RpcWalletNote | undefined = undefined

    for (const note of transaction.notes) {
      const incomingAddresses = config.incomingAddresses
      if (
        note.sender.toLowerCase() !==
        incomingAddresses.find((address) => address.toLowerCase() === note.sender.toLowerCase())
      ) {
        return {
          isChainportTransaction: false,
        }
      }
      bridgeNote = note
    }

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
      Buffer.from(bridgeNote?.memoHex).toString(),
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
  } else if (transaction.type === TransactionType.SEND) {
    if (transaction.notes.length < 2) {
      return {
        isChainportTransaction: false,
      }
    }

    const bridgeAddresses = config.outgoingAddresses.map((address) => address.toLowerCase())

    const bridgeNote = transaction.notes.find((note) =>
      bridgeAddresses.includes(note.owner.toLowerCase()),
    )

    if (!bridgeNote) {
      return {
        isChainportTransaction: false,
      }
    }

    const feeNote = transaction.notes.find((note) => note.memo === '{"type": "fee_payment"}')

    if (!feeNote) {
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

  return {
    isChainportTransaction: false,
  }
}
