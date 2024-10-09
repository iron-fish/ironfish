/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { MAINNET, TESTNET } from '@ironfish/sdk'

const config = {
  [TESTNET.id]: {
    endpoint: 'https://testnet.api.ironfish.network/',
    outgoingAddresses: new Set([
      '06102d319ab7e77b914a1bd135577f3e266fd82a3e537a02db281421ed8b3d13',
      'db2cf6ec67addde84cc1092378ea22e7bb2eecdeecac5e43febc1cb8fb64b5e5',
      '3be494deb669ff8d943463bb6042eabcf0c5346cf444d569e07204487716cb85',
    ]),
    incomingAddresses: new Set([
      '06102d319ab7e77b914a1bd135577f3e266fd82a3e537a02db281421ed8b3d13',
    ]),
  },
  [MAINNET.id]: {
    endpoint: 'https://api.ironfish.network/',
    outgoingAddresses: new Set([
      '576ffdcc27e11d81f5180d3dc5690294941170d492b2d9503c39130b1f180405',
      '7ac2d6a59e19e66e590d014af013cd5611dc146e631fa2aedf0ee3ed1237eebe',
    ]),
    incomingAddresses: new Set([
      '1216302193e8f1ad020f458b54a163039403d803e98673c6a85e59b5f4a1a900',
    ]),
  },
}

export const isNetworkSupportedByChainport = (networkId: number) => {
  return !!config[networkId]
}

export const getConfig = (networkId: number) => {
  if (!config[networkId]) {
    throw new Error(`Unsupported network ${networkId} for chainport`)
  }

  return config[networkId]
}
