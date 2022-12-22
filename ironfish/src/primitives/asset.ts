/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import { GENESIS_BLOCK_PREVIOUS } from './block'

export const NATIVE_ASSET_VALUE = {
  createdTransactionHash: GENESIS_BLOCK_PREVIOUS,
  identifier: Asset.nativeIdentifier(),
  metadata: Buffer.from('Native asset of Iron Fish blockchain', 'utf8'),
  name: Buffer.from('$IRON', 'utf8'),
  nonce: 0,
  owner: Buffer.from('Iron Fish', 'utf8'),
  supply: BigInt(0),
}
