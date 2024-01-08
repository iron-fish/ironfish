/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export const EXPLORER_URL_MAINNET = 'https://explorer.ironfish.network'
export const EXPLORER_URL_TESTNET = 'https://testnet.explorer.ironfish.network'

export const getExplorerUrl = (networkId: number): string | null => {
  switch (networkId) {
    case 0:
      return EXPLORER_URL_TESTNET
    case 1:
      return EXPLORER_URL_MAINNET
    default:
      return null
  }
}

export const getTransactionUrl = (networkId: number, txId?: string): string | null => {
  const explorerUrl = getExplorerUrl(networkId)
  return explorerUrl ? `${explorerUrl}/transaction${txId ? `/${txId}` : ''}` : null
}

export const getBlockUrl = (networkId: number, blockHash?: string): string | null => {
  const explorerUrl = getExplorerUrl(networkId)
  return explorerUrl ? `${explorerUrl}/blocks${blockHash ? `/${blockHash}` : ''}` : null
}
