/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'

export function isNativeIdentifier(assetId: string): boolean {
  return Buffer.from(assetId, 'hex').equals(Asset.nativeId())
}

export const NativeAssetId = Asset.nativeId().toString('hex')
