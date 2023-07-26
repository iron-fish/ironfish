/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import { BufferMap } from 'buffer-map'

export interface MintDescription {
  asset: Asset
  value: bigint
  transferOwnershipTo: string | null
}

/**
 * Iterates the mints, creating an array of owners and updating the assetOwners
 * map if the owner changes for that asset in this group of mints. Optionally,
 * will use an existing array to append to, if provided.
 */
export function processMintOwners(
  mints: Iterable<MintDescription>,
  assetOwners: BufferMap<Buffer>,
  existingMintOwners?: Buffer[],
): Buffer[] {
  const mintOwners = existingMintOwners ?? []

  for (const mint of mints) {
    const assetId = mint.asset.id()
    const assetOwner = assetOwners.get(assetId)

    if (assetOwner) {
      mintOwners.push(assetOwner)
    } else {
      const creator = mint.asset.creator()
      assetOwners.set(assetId, creator)
      mintOwners.push(creator)
    }

    // TODO(IFL-1404): Update assetOwners if ownership is transferred
  }

  return mintOwners
}
