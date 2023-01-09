/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
export type MintAssetOptions =
  | {
      fee: bigint
      metadata: string
      name: string
      transactionExpirationDelta: number
      value: bigint
      expiration?: number
    }
  | {
      assetId: Buffer
      fee: bigint
      transactionExpirationDelta: number
      value: bigint
      expiration?: number
    }
