/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { TESTNET } from '@ironfish/sdk'

const config = {
  [TESTNET.id]: {
    chainportId: 22,
    endpoint: 'https://preprod-api.chainport.io',
    outgoingAddresses: new Set([
      '06102d319ab7e77b914a1bd135577f3e266fd82a3e537a02db281421ed8b3d13',
      'db2cf6ec67addde84cc1092378ea22e7bb2eecdeecac5e43febc1cb8fb64b5e5',
      '3be494deb669ff8d943463bb6042eabcf0c5346cf444d569e07204487716cb85',
    ]),
    incomingAddresses: new Set([
      '06102d319ab7e77b914a1bd135577f3e266fd82a3e537a02db281421ed8b3d13',
    ]),
  },
} // MAINNET support to follow

export const isNetworkSupportedByChainport = (networkId: number) => {
  return !!config[networkId]
}

export const getConfig = (networkId: number) => {
  if (!config[networkId]) {
    throw new Error(`Unsupported network ${networkId} for chainport`)
  }

  return config[networkId]
}
