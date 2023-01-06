/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Asset, TransactionPosted } from '@ironfish/rust-nodejs'
import { BufferMap } from 'buffer-map'
import { Assert } from '../../assert'
import { LeafEncoding } from '../../merkletree/database/leaves'
import { NodeEncoding } from '../../merkletree/database/nodes'
import { NoteHasher } from '../../merkletree/hasher'
import { MerkleTree, Side } from '../../merkletree/merkletree'
import { NoteEncrypted, NoteEncryptedHash } from '../../primitives/noteEncrypted'
import { BUFFER_ENCODING, IDatabase } from '../../storage'
import { createNodeTest, useAccountFixture, useMinersTxFixture } from '../../testUtilities'
import { makeDb, makeDbName } from '../../testUtilities/helpers/storage'
import {
  CreateTransactionRequest,
  CreateTransactionResponse,
  CreateTransactionTask,
} from './createTransaction'

async function makeStrategyTree({
  depth,
  name,
  database,
}: {
  depth?: number
  name?: string
  database?: IDatabase
} = {}): Promise<MerkleTree<NoteEncrypted, NoteEncryptedHash, Buffer, Buffer>> {
  const openDb = !database

  if (!name) {
    name = makeDbName()
  }
  if (!database) {
    database = makeDb(name)
  }

  const tree = new MerkleTree({
    hasher: new NoteHasher(),
    leafIndexKeyEncoding: BUFFER_ENCODING,
    leafEncoding: new LeafEncoding(),
    nodeEncoding: new NodeEncoding(),
    db: database,
    name: name,
    depth: depth,
    defaultValue: Buffer.alloc(32),
  })

  if (openDb) {
    await database.open()
  }

  return tree
}

type ThenArg<T> = T extends PromiseLike<infer U> ? U : T

describe('CreateTransactionRequest', () => {
  const nodeTest = createNodeTest()

  it('serializes the object into a buffer and deserializes to the original object', async () => {
    const account = await useAccountFixture(nodeTest.wallet)
    const mintAsset = new Asset(account.spendingKey, 'mint-asset', 'metadata')
    const burnAsset = new Asset(account.spendingKey, 'burn-asset', 'metadata')
    const request = new CreateTransactionRequest(
      '',
      BigInt(1),
      5,
      [
        {
          note: Buffer.from(''),
          treeSize: 5,
          rootHash: Buffer.from(''),
          authPath: [
            {
              side: Side.Left,
              hashOfSibling: Buffer.from(''),
            },
          ],
        },
      ],
      [
        {
          publicAddress: '',
          amount: BigInt(5),
          memo: '👁️🏃🐟',
          assetId: Asset.nativeId(),
        },
      ],
      [
        {
          asset: mintAsset,
          value: BigInt(10),
        },
      ],
      [
        {
          assetId: burnAsset.id(),
          value: BigInt(2),
        },
      ],
    )

    const buffer = request.serialize()
    const deserializedRequest = CreateTransactionRequest.deserialize(request.jobId, buffer)
    expect(deserializedRequest).toEqual(request)
  })
})

describe('CreateTransactionResponse', () => {
  it('serializes the object into a buffer and deserializes to the original object', () => {
    const response = new CreateTransactionResponse(Buffer.from('abcd'), 0)
    const buffer = response.serialize()
    const deserializedResponse = CreateTransactionResponse.deserialize(response.jobId, buffer)
    expect(deserializedResponse).toEqual(response)
  })
})

describe('CreateTransactionTask', () => {
  let tree: ThenArg<ReturnType<typeof makeStrategyTree>>

  beforeAll(async () => {
    tree = await makeStrategyTree()
  })
  const nodeTest = createNodeTest()

  describe('execute', () => {
    it('creates the transaction', async () => {
      const account = await useAccountFixture(nodeTest.wallet)
      const asset = new Asset(account.spendingKey, 'test-asset', 'fake-metadata')
      const mintValue = BigInt(10)
      const burnValue = BigInt(2)
      const fee = BigInt(1)

      const minerTransaction = await useMinersTxFixture(nodeTest.wallet, account)

      const spendNote = minerTransaction.getNote(0).decryptNoteForOwner(account.incomingViewKey)
      Assert.isNotUndefined(spendNote)
      for (let i = 0; i < minerTransaction.notes.length; i++) {
        const note = minerTransaction.getNote(i)
        await tree.add(note)
      }

      const authPath = (await tree.witness(0))?.authenticationPath
      Assert.isNotUndefined(authPath)

      const task = new CreateTransactionTask()
      const request = new CreateTransactionRequest(
        account.spendingKey,
        fee,
        15,
        [
          {
            note: spendNote.serialize(),
            treeSize: await tree.size(),
            rootHash: await tree.rootHash(),
            authPath,
          },
        ],
        [
          {
            publicAddress: account.publicAddress,
            amount: BigInt(1),
            memo: '',
            assetId: Asset.nativeId(),
          },
        ],
        [
          {
            asset,
            value: mintValue,
          },
        ],
        [
          {
            assetId: asset.id(),
            value: burnValue,
          },
        ],
      )

      const response = task.execute(request)

      // Verify that the transaction is valid
      const transactionPosted = new TransactionPosted(
        Buffer.from(response.serializedTransactionPosted),
      )
      expect(transactionPosted.verify()).toBe(true)
      expect(transactionPosted.notesLength()).toBe(3)

      const outputValuesByAssetId = new BufferMap<bigint>()
      for (let i = 0; i < transactionPosted.notesLength(); i++) {
        const decryptedNote = new NoteEncrypted(
          transactionPosted.getNote(i),
        ).decryptNoteForOwner(account.incomingViewKey)
        Assert.isNotUndefined(decryptedNote)

        const id = decryptedNote.assetId()
        const value = outputValuesByAssetId.get(id) || BigInt(0)
        outputValuesByAssetId.set(id, value + decryptedNote.value())
      }

      const nativeAssetValue = outputValuesByAssetId.get(Asset.nativeId())
      Assert.isNotUndefined(nativeAssetValue)
      expect(nativeAssetValue).toEqual(2000000000n - fee)

      const mintedAssetValue = outputValuesByAssetId.get(asset.id())
      Assert.isNotUndefined(mintedAssetValue)
      expect(mintedAssetValue).toEqual(mintValue - burnValue)
    })
  })
})
