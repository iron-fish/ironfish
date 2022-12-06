/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Asset } from '@ironfish/rust-nodejs'
import { Assert } from '../assert'
import { IronfishNode } from '../node'
import { Block } from '../primitives'
import { NoteEncrypted } from '../primitives/noteEncrypted'
import { createNodeTest, useAccountFixture, useBlockWithRawTxFixture } from '../testUtilities'
import { Account } from '../wallet'

describe('Blockchain', () => {
  const nodeTest = createNodeTest()

  describe('asset updates', () => {
    async function mintAsset(
      node: IronfishNode,
      account: Account,
      sequence: number,
      asset: Asset,
      value: bigint,
    ): Promise<Block> {
      return useBlockWithRawTxFixture(
        node.chain,
        node.workerPool,
        account,
        [],
        [],
        [{ asset, value }],
        [],
        sequence,
      )
    }

    async function burnAsset(
      node: IronfishNode,
      account: Account,
      sequence: number,
      asset: Asset,
      value: bigint,
      noteToBurn: NoteEncrypted,
    ): Promise<Block> {
      return useBlockWithRawTxFixture(
        node.chain,
        node.workerPool,
        account,
        [noteToBurn],
        [],
        [],
        [{ asset, value }],
        sequence,
      )
    }

    describe('with a mint description', () => {
      it('upserts an asset to the database', async () => {
        const { node } = await nodeTest.createSetup()
        const wallet = node.wallet
        const account = await useAccountFixture(wallet)

        const asset = new Asset(account.spendingKey, 'mint-asset', 'metadata')
        const value = BigInt(10)

        const block = await mintAsset(node, account, 2, asset, value)
        await expect(node.chain).toAddBlock(block)

        const transactions = block.transactions
        expect(transactions).toHaveLength(2)
        const mintTransaction = transactions[1]

        const mintedAsset = await node.chain.assets.get(asset.identifier())
        expect(mintedAsset).toEqual({
          createdTransactionHash: mintTransaction.hash(),
          metadata: asset.metadata(),
          name: asset.name(),
          nonce: asset.nonce(),
          owner: asset.owner(),
          supply: value,
        })
      })
    })

    describe('with a burn description', () => {
      it('decrements the asset supply from the database', async () => {
        const { node } = await nodeTest.createSetup()
        const wallet = node.wallet
        const account = await useAccountFixture(wallet)

        const asset = new Asset(account.spendingKey, 'mint-asset', 'metadata')

        // Mint so we have an existing asset
        const mintValue = BigInt(10)
        const blockA = await mintAsset(node, account, 2, asset, mintValue)
        await expect(node.chain).toAddBlock(blockA)

        // Burn some value, use previous mint output as spend
        const burnValue = BigInt(3)
        const noteToBurn = blockA.transactions[1].getNote(0)
        const blockB = await burnAsset(node, account, 3, asset, burnValue, noteToBurn)
        await expect(node.chain).toAddBlock(blockB)

        const mintedAsset = await node.chain.assets.get(asset.identifier())
        expect(mintedAsset).toMatchObject({
          supply: mintValue - burnValue,
        })
      })
    })

    describe('with a subsequent mint', () => {
      it('should keep the same created transaction hash and increase the supply', async () => {
        const { node } = await nodeTest.createSetup()
        const wallet = node.wallet
        const account = await useAccountFixture(wallet)

        const asset = new Asset(account.spendingKey, 'mint-asset', 'metadata')
        const firstMintValue = BigInt(10)

        const blockA = await mintAsset(node, account, 2, asset, firstMintValue)
        await expect(node.chain).toAddBlock(blockA)

        const secondMintValue = BigInt(2)
        const blockB = await mintAsset(node, account, 3, asset, secondMintValue)
        await expect(node.chain).toAddBlock(blockB)

        const transactions = blockA.transactions
        expect(transactions).toHaveLength(2)
        const firstMintTransaction = transactions[1]

        const mintedAsset = await node.chain.assets.get(asset.identifier())
        expect(mintedAsset).toEqual({
          createdTransactionHash: firstMintTransaction.hash(),
          metadata: asset.metadata(),
          name: asset.name(),
          nonce: asset.nonce(),
          owner: asset.owner(),
          supply: firstMintValue + secondMintValue,
        })
      })
    })

    describe('when the first mint gets rolled back', () => {
      it('should delete the asset', async () => {
        const { node } = await nodeTest.createSetup()
        const wallet = node.wallet
        const account = await useAccountFixture(wallet)

        const asset = new Asset(account.spendingKey, 'mint-asset', 'metadata')
        const value = BigInt(10)

        const block = await mintAsset(node, account, 2, asset, value)
        await expect(node.chain).toAddBlock(block)

        await node.chain.removeBlock(block.header.hash)

        const mintedAsset = await node.chain.assets.get(asset.identifier())
        expect(mintedAsset).toBeUndefined()
      })
    })

    describe('when a subsequent mint gets rolled back', () => {
      it('should decrement the supply', async () => {
        const { node } = await nodeTest.createSetup()
        const wallet = node.wallet
        const account = await useAccountFixture(wallet)

        const asset = new Asset(account.spendingKey, 'mint-asset', 'metadata')
        const firstMintValue = BigInt(10)

        const blockA = await mintAsset(node, account, 2, asset, firstMintValue)
        await expect(node.chain).toAddBlock(blockA)

        const secondMintValue = BigInt(2)
        const blockB = await mintAsset(node, account, 3, asset, secondMintValue)
        await expect(node.chain).toAddBlock(blockB)

        await node.chain.removeBlock(blockB.header.hash)

        const mintedAsset = await node.chain.assets.get(asset.identifier())
        expect(mintedAsset).toMatchObject({
          supply: firstMintValue,
        })
      })
    })

    describe('when a burn gets rolled back', () => {
      it('should increase the supply', async () => {
        const { node } = await nodeTest.createSetup()
        const wallet = node.wallet
        const account = await useAccountFixture(wallet)

        const asset = new Asset(account.spendingKey, 'mint-asset', 'metadata')

        const mintValue = BigInt(10)
        const blockA = await mintAsset(node, account, 2, asset, mintValue)
        await expect(node.chain).toAddBlock(blockA)

        const burnValue = BigInt(3)
        const noteToBurn = blockA.transactions[1].getNote(0)
        const blockB = await burnAsset(node, account, 3, asset, burnValue, noteToBurn)
        await expect(node.chain).toAddBlock(blockB)

        await node.chain.removeBlock(blockB.header.hash)

        const mintedAsset = await node.chain.assets.get(asset.identifier())
        expect(mintedAsset).toMatchObject({
          supply: mintValue,
        })
      })
    })

    describe('when burning too much value', () => {
      it('throws an exception', async () => {
        const { node } = await nodeTest.createSetup()
        const wallet = node.wallet
        const account = await useAccountFixture(wallet)

        const asset = new Asset(account.spendingKey, 'mint-asset', 'metadata')
        const assetIdentifier = asset.identifier()

        const mintValue = BigInt(10)
        const blockA = await mintAsset(node, account, 2, asset, mintValue)
        await expect(node.chain).toAddBlock(blockA)

        const record = await node.chain.assets.get(assetIdentifier)
        Assert.isNotUndefined(record)
        // Perform a hack where we adjust the supply in the DB to be lower than
        // what was previously minted. This is done to check what happens if a
        // burn is processed but the DB does not have enough supply for a given
        // burn. Without this, the posted transaction would raise an invalid
        // balance exception, which is a separate flow to test for.
        await node.chain.assets.put(assetIdentifier, {
          ...record,
          supply: BigInt(1),
        })

        const burnValue = BigInt(3)
        const noteToBurn = blockA.transactions[1].getNote(0)
        const blockB = await burnAsset(node, account, 3, asset, burnValue, noteToBurn)
        await expect(node.chain.addBlock(blockB)).rejects.toThrowError('Invalid burn value')
      })
    })

    describe('when rolling back multiple mints and burns', () => {
      it('adjusts the supply accordingly', async () => {
        const { node } = await nodeTest.createSetup()
        const wallet = node.wallet
        const account = await useAccountFixture(wallet)

        const asset = new Asset(account.spendingKey, 'mint-asset', 'metadata')
        const assetIdentifier = asset.identifier()

        // 1. Mint 10
        const mintValueA = BigInt(10)
        const blockA = await mintAsset(node, account, 2, asset, mintValueA)
        await expect(node.chain).toAddBlock(blockA)
        // Check first mint value
        let record = await node.chain.assets.get(assetIdentifier)
        Assert.isNotUndefined(record)
        expect(record).toMatchObject({
          createdTransactionHash: blockA.transactions[1].hash(),
          supply: mintValueA,
        })

        // 2. Mint 8
        const mintValueB = BigInt(10)
        const blockB = await mintAsset(node, account, 3, asset, mintValueB)
        await expect(node.chain).toAddBlock(blockB)
        // Check aggregate mint value
        record = await node.chain.assets.get(assetIdentifier)
        Assert.isNotUndefined(record)
        expect(record).toMatchObject({
          createdTransactionHash: blockA.transactions[1].hash(),
          supply: mintValueA + mintValueB,
        })

        // 3. Burn 5
        const burnValueC = BigInt(5)
        const noteToBurnC = blockB.transactions[1].getNote(0)
        const blockC = await burnAsset(node, account, 4, asset, burnValueC, noteToBurnC)
        await expect(node.chain).toAddBlock(blockC)
        // Check value after burn
        record = await node.chain.assets.get(assetIdentifier)
        Assert.isNotUndefined(record)
        expect(record).toMatchObject({
          createdTransactionHash: blockA.transactions[1].hash(),
          supply: mintValueA + mintValueB - burnValueC,
        })

        // 4. Roll back the burn from Block C (Step 3 above)
        await node.chain.removeBlock(blockC.header.hash)
        // Check value after burn roll back
        record = await node.chain.assets.get(assetIdentifier)
        Assert.isNotUndefined(record)
        expect(record).toMatchObject({
          createdTransactionHash: blockA.transactions[1].hash(),
          supply: mintValueA + mintValueB,
        })

        // 5. Burn some more
        const burnValueD = BigInt(7)
        const noteToBurnD = blockB.transactions[1].getNote(0)
        const blockD = await burnAsset(node, account, 4, asset, burnValueD, noteToBurnD)
        await expect(node.chain).toAddBlock(blockD)
        // Check aggregate mint value
        record = await node.chain.assets.get(assetIdentifier)
        Assert.isNotUndefined(record)
        expect(record).toMatchObject({
          createdTransactionHash: blockA.transactions[1].hash(),
          supply: mintValueA + mintValueB - burnValueD,
        })

        // 6. Mint some more
        const mintValueE = BigInt(10)
        const blockE = await mintAsset(node, account, 5, asset, mintValueE)
        await expect(node.chain).toAddBlock(blockE)
        // Check aggregate mint value
        record = await node.chain.assets.get(assetIdentifier)
        Assert.isNotUndefined(record)
        expect(record).toMatchObject({
          createdTransactionHash: blockA.transactions[1].hash(),
          supply: mintValueA + mintValueB - burnValueD + mintValueE,
        })

        // 7. Roll back the mint from Block E (Step 6 above)
        await node.chain.removeBlock(blockE.header.hash)
        // Check value after burn roll back
        record = await node.chain.assets.get(assetIdentifier)
        Assert.isNotUndefined(record)
        expect(record).toMatchObject({
          createdTransactionHash: blockA.transactions[1].hash(),
          supply: mintValueA + mintValueB - burnValueD,
        })
      }, 60000)
    })
  })
})
