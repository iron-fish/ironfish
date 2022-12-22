/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Blockchain } from '../blockchain'
import { AssetsValue } from '../blockchain/database/assets'
import { Block } from '../primitives'
import { GENESIS_BLOCK_PREVIOUS, GENESIS_BLOCK_SEQUENCE } from '../primitives/block'
import { isTransactionMine } from '../testUtilities/helpers/transaction'
import { Account } from '../wallet'
import { Asset } from '@ironfish/rust-nodejs'

export function getBlockRange(
  chain: Blockchain,
  range?: {
    start?: number | null
    stop?: number | null
  },
): { start: number; stop: number } {
  const min = Number(GENESIS_BLOCK_SEQUENCE)
  const max = Number(chain.latest.sequence)

  let start = range?.start ? range.start : min
  let stop = range?.stop ? range.stop : max

  // Negative numbers start from the end
  if (start < 0) {
    start = max + start
  }
  if (stop < 0) {
    stop = max + stop
  }

  // Truncate fractions from parameters
  stop = Math.floor(stop)
  start = Math.floor(start)

  // Ensure values are in valid range and start < stop
  start = Math.min(Math.max(start, min), max)
  stop = Math.max(Math.min(Math.max(stop, min), max), start)

  return { start, stop }
}

export const NATIVE_ASSET_VALUE = {
  createdTransactionHash: GENESIS_BLOCK_PREVIOUS,
  identifier: Asset.nativeIdentifier(),
  metadata: Buffer.from("Native asset of Iron Fish blockchain", 'utf8'),
  name: Buffer.from("$IRON", 'utf8'),
  nonce: 0,
  owner: Buffer.from("Iron Fish", 'utf8'),
  supply: BigInt(0),
}

export async function getAssetById(assetIdentifier: Buffer, chain: Blockchain): Promise<AssetsValue|undefined> {
  if (Asset.nativeIdentifier().equals(assetIdentifier)) {
    return NATIVE_ASSET_VALUE
  }
  return await chain.assets.get(assetIdentifier)
}

export function isBlockMine(block: Block, account: Account): boolean {
  return isTransactionMine(block.minersFee, account)
}

export const BlockchainUtils = { isBlockMine, getBlockRange }
