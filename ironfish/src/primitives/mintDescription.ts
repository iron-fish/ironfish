/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NativeAsset } from '@ironfish/rust-nodejs'

export class MintDescription {
  readonly asset: NativeAsset
  readonly value: number

  constructor(asset: NativeAsset, value: number) {
    this.asset = asset
    this.value = value
  }
}
