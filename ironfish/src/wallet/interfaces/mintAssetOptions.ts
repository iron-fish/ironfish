/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
export type MintAssetOptions =
  | {
      fee?: bigint
      feeRate?: bigint
      metadata: string
      name: string
      value: bigint
      expirationDelta: number
      expiration?: number
      confirmations?: number
      transferOwnershipTo?: string
    }
  | {
      assetId: Buffer
      fee?: bigint
      feeRate?: bigint
      value: bigint
      expirationDelta: number
      expiration?: number
      confirmations?: number
      transferOwnershipTo?: string
    }
