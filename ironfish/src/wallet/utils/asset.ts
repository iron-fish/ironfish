/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Account } from '../account/account'
import { AssetValue } from '../walletdb/assetValue'

export enum AssetStatus {
  CONFIRMED = 'confirmed',
  PENDING = 'pending',
  UNCONFIRMED = 'unconfirmed',
  UNKNOWN = 'unknown',
}

export async function getAssetStatus(
  account: Account,
  assetValue: AssetValue,
  confirmations: number,
  options?: {
    headSequence?: number | null
  },
): Promise<AssetStatus> {
  const headSequence = options?.headSequence ?? (await account.getHead())?.sequence
  if (!headSequence) {
    return AssetStatus.UNKNOWN
  }

  if (assetValue.sequence) {
    const confirmed = headSequence - assetValue.sequence >= confirmations
    return confirmed ? AssetStatus.CONFIRMED : AssetStatus.UNCONFIRMED
  }

  return AssetStatus.PENDING
}
