/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { DEVNET_GENESIS } from './genesisBlocks/devnet'
import { MAINNET_GENESIS } from './genesisBlocks/mainnet'
import { TESTNET_GENESIS } from './genesisBlocks/testnet'

export function isDefaultNetworkId(networkId: number): boolean {
  return networkId <= 100
}

export function defaultNetworkName(networkId: number): string | undefined {
  switch (networkId) {
    case 0:
      return 'Testnet'
    case 1:
      return 'Mainnet'
    case 2:
      return 'Devnet'
  }
}

// TODO(IFL-1523): Update proper activation sequence for enableAssetOwnership
export const TESTNET = `
{
  "id": 0,
  "bootstrapNodes": ["1.test.bn.ironfish.network", "2.test.bn.ironfish.network"],
  "genesis": ${TESTNET_GENESIS},
  "consensus": {
      "allowedBlockFutureSeconds": 15,
      "genesisSupplyInIron": 42000000,
      "targetBlockTimeInSeconds": 60,
      "targetBucketTimeInSeconds": 10,
      "maxBlockSizeBytes": 524288,
      "minFee": 1,
      "enableAssetOwnership": 9999999
  }
}`

// TODO(IFL-1523): Update proper activation sequence for enableAssetOwnership
export const MAINNET = `
{
    "id": 1,
    "bootstrapNodes": ["1.main.bn.ironfish.network", "2.main.bn.ironfish.network"],
    "genesis": ${MAINNET_GENESIS},
    "consensus": {
        "allowedBlockFutureSeconds": 15,
        "genesisSupplyInIron": 42000000,
        "targetBlockTimeInSeconds": 60,
        "targetBucketTimeInSeconds": 10,
        "maxBlockSizeBytes": 524288,
        "minFee": 1,
        "enableAssetOwnership": 9999999
    }
}`

// TODO(IFL-1523): Update proper activation sequence for enableAssetOwnership
export const DEVNET = `
{
    "id": 2,
    "bootstrapNodes": [],
    "genesis": ${DEVNET_GENESIS},
    "consensus": {
        "allowedBlockFutureSeconds": 15,
        "genesisSupplyInIron": 42000000,
        "targetBlockTimeInSeconds": 60,
        "targetBucketTimeInSeconds": 10,
        "maxBlockSizeBytes": 524288,
        "minFee": 0,
        "enableAssetOwnership": 1
    }
}`
