/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'

export class BurnDescription {
  readonly asset: Asset
  readonly value: number

  constructor(asset: Asset, value: number) {
    this.asset = asset
    this.value = value
  }
}
