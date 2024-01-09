/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export const EXPLORER_URLS = {
  0: 'https://testnet.explorer.ironfish.network',
  1: 'https://explorer.ironfish.network',
}

type ValidNetworkId = keyof typeof EXPLORER_URLS

type Explorer = {
  getBlockUrl: (hash: string) => string
  getTransactionUrl: (hash: string) => string
}

export const getExplorer = (networkId: number): Explorer | null => {
  if (!(networkId in EXPLORER_URLS)) {
    return null
  }

  const url = EXPLORER_URLS[networkId as ValidNetworkId]
  return {
    getBlockUrl: (hash: string) => `${url}/blocks/${hash}`,
    getTransactionUrl: (hash: string) => `${url}/transaction/${hash}`,
  }
}
