/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset, generateKey, Note as NativeNote } from '@ironfish/rust-nodejs'
import { BufferMap } from 'buffer-map'
import { Assert } from '../assert'
import { makeFakeWitness } from '../devUtils'
import { IsNoteWitnessEqual } from '../merkletree/witness'
import {
  useAccountFixture,
  useMinerBlockFixture,
  useMintBlockFixture,
} from '../testUtilities/fixtures'
import { createRawTransaction } from '../testUtilities/helpers/transaction'
import { createNodeTest } from '../testUtilities/nodeTest'
import { Note } from './note'
import { MintData, RawTransaction, RawTransactionSerde } from './rawTransaction'
import { TransactionVersion } from './transaction'

describe('RawTransaction', () => {
  const nodeTest = createNodeTest()

  it('should post', async () => {
    const account = await useAccountFixture(nodeTest.wallet)
    const asset = new Asset(account.publicAddress, 'test', '')

    const block = await useMinerBlockFixture(
      nodeTest.chain,
      undefined,
      account,
      nodeTest.wallet,
    )
    await expect(nodeTest.chain).toAddBlock(block)
    await nodeTest.wallet.scan()
    const { unconfirmed } = await account.getUnconfirmedBalance(Asset.nativeId())

    const burn = {
      assetId: Asset.nativeId(),
      value: 2n,
    }

    const mint: MintData = {
      creator: asset.creator().toString('hex'),
      name: asset.name().toString('utf8'),
      metadata: asset.metadata().toString('utf8'),
      value: 1n,
    }

    const raw = await createRawTransaction({
      wallet: nodeTest.wallet,
      from: account,
      to: account,
      amount: 1n,
      fee: 5n,
      expiration: 10,
      burns: [burn],
      mints: [mint],
    })

    const posted = raw.post(account.spendingKey)
    expect(await nodeTest.workerPool.verifyTransactions([posted])).toEqual({ valid: true })
    expect(posted.fee()).toEqual(5n)
    expect(posted.expiration()).toEqual(10)
    expect(posted.notes.length).toEqual(3)
    expect(posted.spends.length).toEqual(1)
    expect(posted.mints.length).toEqual(1)
    expect(posted.burns.length).toEqual(1)

    const valuesByAsset = new BufferMap<bigint>()

    for (const note of posted.notes) {
      const decryptedNote = note.decryptNoteForOwner(account.incomingViewKey)
      Assert.isNotUndefined(decryptedNote)

      const id = decryptedNote.assetId()
      const value = valuesByAsset.get(id) || 0n
      valuesByAsset.set(id, value + decryptedNote.value())
    }

    const nativeValue = valuesByAsset.get(Asset.nativeId())
    Assert.isNotUndefined(nativeValue)
    expect(nativeValue).toEqual(unconfirmed - raw.fee - mint.value - 1n)

    const mintedValue = valuesByAsset.get(asset.id())
    Assert.isNotUndefined(mintedValue)
    expect(mintedValue).toEqual(1n)

    // should have same size for posted transaction and estimated size from raw transaction
    const serializedPost = posted.serialize()
    expect(raw.postedSize()).toEqual(serializedPost.byteLength)
  })

  it('should throw an error if the max mint value is exceeded', async () => {
    const account = await useAccountFixture(nodeTest.wallet)
    const asset = new Asset(account.publicAddress, 'test', '')
    const assetName = asset.name().toString('utf8')

    const block = await useMinerBlockFixture(
      nodeTest.chain,
      undefined,
      account,
      nodeTest.wallet,
    )
    await expect(nodeTest.chain).toAddBlock(block)
    await nodeTest.wallet.scan()

    const mint = {
      creator: account.publicAddress,
      name: assetName,
      metadata: '',
      value: BigInt(500_000_000_000_000_000n),
    }

    const raw = await createRawTransaction({
      wallet: nodeTest.wallet,
      from: account,
      to: account,
      amount: 1n,
      fee: 5n,
      expiration: 10,
      burns: [],
      mints: [mint],
    })

    expect(() => raw.post(account.spendingKey)).toThrow(
      /Cannot post transaction. Mint value *.* exceededs maximum *.*/,
    )
  })

  it('should throw an error if the max burn value is exceeded', async () => {
    const node = nodeTest.node
    const account = await useAccountFixture(nodeTest.wallet)
    const asset = new Asset(account.publicAddress, 'test', '')

    const block = await useMinerBlockFixture(
      nodeTest.chain,
      undefined,
      account,
      nodeTest.wallet,
    )
    await expect(nodeTest.chain).toAddBlock(block)
    await nodeTest.wallet.scan()

    const mintBlockA = await useMintBlockFixture({
      node,
      account,
      asset,
      value: BigInt(100_000_000_000_000_000n),
    })
    await expect(nodeTest.chain).toAddBlock(mintBlockA)
    await nodeTest.wallet.scan()

    const mintBlockB = await useMintBlockFixture({
      node,
      account,
      asset,
      value: BigInt(100_000_000_000_000_000n),
    })
    await expect(nodeTest.chain).toAddBlock(mintBlockB)
    await nodeTest.wallet.scan()

    const burn = {
      assetId: asset.id(),
      value: BigInt(200_000_000_000_000_000n),
    }
    const raw = await createRawTransaction({
      wallet: nodeTest.wallet,
      from: account,
      to: account,
      amount: 1n,
      fee: 5n,
      expiration: 10,
      burns: [burn],
      mints: [],
    })

    expect(() => raw.post(account.spendingKey)).toThrow(
      /Cannot post transaction. Burn value *.* exceededs maximum *.*/,
    )
  })
})

describe('RawTransactionSerde', () => {
  const nodeTest = createNodeTest()

  it('throws an error if a v2 field is provided on a v1 transaction', async () => {
    const account = await useAccountFixture(nodeTest.wallet)

    const raw = new RawTransaction(TransactionVersion.V1)
    raw.mints = [
      {
        creator: account.publicAddress,
        name: 'asset',
        metadata: 'metadata',
        value: 5n,
        transferOwnershipTo: account.publicAddress,
      },
    ]

    expect(() => RawTransactionSerde.serialize(raw)).toThrow(
      'Version 1 transactions cannot contain transferOwnershipTo',
    )
  })

  it('serializes and deserializes a v1 transaction', async () => {
    const account = await useAccountFixture(nodeTest.wallet)
    const asset = new Asset(account.publicAddress, 'asset', 'metadata')
    const assetName = 'asset'
    const assetMetadata = 'metadata'

    const note = new Note(
      new NativeNote(
        generateKey().publicAddress,
        5n,
        Buffer.from('memo'),
        asset.id(),
        account.publicAddress,
      ).serialize(),
    )

    const witness = makeFakeWitness(note)

    const raw = new RawTransaction(TransactionVersion.V1)
    raw.expiration = 60
    raw.fee = 1337n

    raw.mints = [
      {
        creator: account.publicAddress,
        name: assetName,
        metadata: assetMetadata,
        value: 5n,
      },
      {
        creator: account.publicAddress,
        name: assetName,
        metadata: assetMetadata,
        value: 4n,
      },
    ]

    raw.burns = [
      {
        assetId: asset.id(),
        value: 5n,
      },
    ]

    raw.outputs = [
      {
        note: note,
      },
    ]

    raw.spends = [{ note, witness }]

    const serialized = RawTransactionSerde.serialize(raw)
    const deserialized = RawTransactionSerde.deserialize(serialized)

    expect(deserialized).toMatchObject({
      expiration: raw.expiration,
      fee: raw.fee,
    })

    expect(RawTransactionSerde.serialize(deserialized).equals(serialized)).toBe(true)
    expect(deserialized.version).toEqual(TransactionVersion.V1)
    expect(deserialized.outputs[0].note).toEqual(raw.outputs[0].note)
    expect(deserialized.burns[0].assetId).toEqual(asset.id())
    expect(deserialized.burns[0].value).toEqual(5n)
    expect(deserialized.mints[0].name).toEqual(assetName)
    expect(deserialized.mints[0].metadata).toEqual(assetMetadata)
    expect(deserialized.mints[0].value).toEqual(5n)

    expect(deserialized.mints[1].name).toEqual(assetName)
    expect(deserialized.mints[1].metadata).toEqual(assetMetadata)
    expect(deserialized.mints[1].value).toEqual(4n)

    expect(deserialized.spends[0].note).toEqual(raw.spends[0].note)
    expect(IsNoteWitnessEqual(deserialized.spends[0].witness, raw.spends[0].witness)).toBe(true)
  })

  it('serializes and deserializes a v2 transaction', async () => {
    const accountA = await useAccountFixture(nodeTest.wallet, 'accountA')
    const accountB = await useAccountFixture(nodeTest.wallet, 'accountB')
    const asset = new Asset(accountA.publicAddress, 'asset', 'metadata')
    const assetName = 'asset'
    const assetMetadata = 'metadata'

    const note = new Note(
      new NativeNote(
        generateKey().publicAddress,
        5n,
        Buffer.from('memo'),
        asset.id(),
        accountA.publicAddress,
      ).serialize(),
    )

    const witness = makeFakeWitness(note)

    const raw = new RawTransaction(TransactionVersion.V2)
    raw.expiration = 60
    raw.fee = 1337n

    raw.mints = [
      {
        creator: accountA.publicAddress,
        name: assetName,
        metadata: assetMetadata,
        value: 5n,
      },
      {
        creator: accountA.publicAddress,
        name: assetName,
        metadata: assetMetadata,
        value: 4n,
        transferOwnershipTo: accountB.publicAddress,
      },
    ]

    raw.burns = [
      {
        assetId: asset.id(),
        value: 5n,
      },
    ]

    raw.outputs = [
      {
        note: note,
      },
    ]

    raw.spends = [{ note, witness }]

    const serialized = RawTransactionSerde.serialize(raw)
    const deserialized = RawTransactionSerde.deserialize(serialized)

    expect(deserialized).toMatchObject({
      expiration: raw.expiration,
      fee: raw.fee,
    })

    expect(RawTransactionSerde.serialize(deserialized).equals(serialized)).toBe(true)
    expect(deserialized.version).toEqual(TransactionVersion.V2)
    expect(deserialized.outputs[0].note).toEqual(raw.outputs[0].note)
    expect(deserialized.burns[0].assetId).toEqual(asset.id())
    expect(deserialized.burns[0].value).toEqual(5n)
    expect(deserialized.mints[0].name).toEqual(assetName)
    expect(deserialized.mints[0].metadata).toEqual(assetMetadata)
    expect(deserialized.mints[0].value).toEqual(5n)

    expect(deserialized.mints[1].name).toEqual(assetName)
    expect(deserialized.mints[1].metadata).toEqual(assetMetadata)
    expect(deserialized.mints[1].value).toEqual(4n)
    expect(deserialized.mints[1].transferOwnershipTo).toEqual(accountB.publicAddress)

    expect(deserialized.spends[0].note).toEqual(raw.spends[0].note)
    expect(IsNoteWitnessEqual(deserialized.spends[0].witness, raw.spends[0].witness)).toBe(true)
  })

  it('serializes and deserializes a transaction with unicode characters', () => {
    const assetName = '吉锕涩偶讷'
    const assetMetadata = '💪💎🚀'

    const raw = new RawTransaction(TransactionVersion.V1)

    raw.mints = [
      {
        creator: '0000',
        name: assetName,
        metadata: assetMetadata,
        value: 5n,
      },
      {
        creator: '0000',
        name: assetName,
        metadata: assetMetadata,
        value: 4n,
      },
    ]

    const serialized = RawTransactionSerde.serialize(raw)
    const deserialized = RawTransactionSerde.deserialize(serialized)

    expect(deserialized.mints[0].name).toEqual(assetName)
    expect(deserialized.mints[0].metadata).toEqual(assetMetadata)

    expect(deserialized.mints[1].name).toEqual(assetName)
    expect(deserialized.mints[1].metadata).toEqual(assetMetadata)
  })
})
