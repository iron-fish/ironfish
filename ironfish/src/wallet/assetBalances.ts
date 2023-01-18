/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BufferMap } from 'buffer-map'

export class AssetBalances extends BufferMap<bigint> {
  increment(assetId: Buffer, delta: bigint): void {
    const currentDelta = this.get(assetId) ?? 0n
    this.set(assetId, currentDelta + delta)
  }

  update(other: AssetBalances): void {
    for (const [assetId, delta] of other.entries()) {
      this.increment(assetId, delta)
    }
  }
}
