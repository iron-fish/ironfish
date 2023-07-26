/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Asset } from '@ironfish/rust-nodejs'
import { BufferMap } from 'buffer-map'
import { createNodeTest, useAccountFixture } from '../testUtilities'
import { MintDescription, processMintOwners } from './mintDescription'

describe('mintDescription', () => {
  const nodeTest = createNodeTest()

  describe('processMintOwners', () => {
    it('should create an array matching the length of the provided mints', async () => {
      const { node } = await nodeTest.createSetup()

      const account1 = await useAccountFixture(node.wallet, 'account1')
      const account2 = await useAccountFixture(node.wallet, 'account2')

      const account1Address = Buffer.from(account1.publicAddress, 'hex')
      const account2Address = Buffer.from(account2.publicAddress, 'hex')

      const asset1 = new Asset(account1.publicAddress, 'testcoin', '')
      const asset2 = new Asset(account2.publicAddress, 'testcoin', '')

      const mints: MintDescription[] = [
        { asset: asset1, value: 10n },
        { asset: asset2, value: 50n },
        { asset: asset1, value: 50n },
        { asset: asset2, value: 10n },
      ]

      const assetOwners: BufferMap<Buffer> = new BufferMap()

      assetOwners.set(asset1.id(), account1Address)
      assetOwners.set(asset2.id(), account2Address)

      const mintOwners = processMintOwners(mints, assetOwners)

      expect(mintOwners).toEqual([
        account1Address,
        account2Address,
        account1Address,
        account2Address,
      ])
    })

    it('should update the asset owner map if there is a missing owner', async () => {
      const { node } = await nodeTest.createSetup()

      const account = await useAccountFixture(node.wallet, 'account')
      const accountAddress = Buffer.from(account.publicAddress, 'hex')

      const asset = new Asset(account.publicAddress, 'testcoin', '')

      const mints: MintDescription[] = [
        { asset: asset, value: 10n },
        { asset: asset, value: 10n },
      ]

      // Intentionally leaving empty
      const assetOwners: BufferMap<Buffer> = new BufferMap()

      const mintOwners = processMintOwners(mints, assetOwners)

      expect(mintOwners).toEqual([accountAddress, accountAddress])

      expect(assetOwners.get(asset.id())).toEqual(accountAddress)
    })

    it('should update the existing mint owners if provided', async () => {
      const { node } = await nodeTest.createSetup()

      const account = await useAccountFixture(node.wallet, 'account')
      const accountAddress = Buffer.from(account.publicAddress, 'hex')

      const asset = new Asset(account.publicAddress, 'testcoin', '')

      const mints: MintDescription[] = [{ asset: asset, value: 10n }]

      const assetOwners: BufferMap<Buffer> = new BufferMap()

      const mintOwners = processMintOwners(mints, assetOwners)

      expect(mintOwners).toEqual([accountAddress])

      const mintOwners2 = processMintOwners(mints, assetOwners, mintOwners)

      expect(mintOwners).toEqual([accountAddress, accountAddress])
      expect(mintOwners).toEqual(mintOwners2)
    })
  })
})
