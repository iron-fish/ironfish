/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Assert } from '../../assert'
import { NoteLeafEncoding } from '../../merkletree/database/leaves'
import { NoteHasher } from '../../merkletree/hasher'
import { MerkleTree, Side } from '../../merkletree/merkletree'
import { NoteEncrypted, NoteEncryptedHash } from '../../primitives/noteEncrypted'
import { IDatabase } from '../../storage'
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
    leafEncoding: new NoteLeafEncoding(),
    db: database,
    name: name,
    depth: depth,
  })

  if (openDb) {
    await database.open()
    await tree.upgrade()
  }

  return tree
}

type ThenArg<T> = T extends PromiseLike<infer U> ? U : T

const mockSerializedTransactionPosted = Buffer.from('foobar')
const postTransaction = jest.fn(() => mockSerializedTransactionPosted)
const receiveTransaction = jest.fn()
const spendTransaction = jest.fn()

jest.mock('@ironfish/rust-nodejs', () => {
  const module =
    jest.requireActual<typeof import('@ironfish/rust-nodejs')>('@ironfish/rust-nodejs')
  return {
    ...module,
    Transaction: jest.fn().mockImplementation(() => ({
      setExpirationSequence: jest.fn(),
      post: postTransaction,
      receive: receiveTransaction,
      spend: spendTransaction,
    })),
  }
})

describe('CreateTransactionRequest', () => {
  it('serializes the object into a buffer and deserializes to the original object', () => {
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
          memo: '',
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
      const account = await useAccountFixture(nodeTest.accounts)
      const minerTransaction = await useMinersTxFixture(nodeTest.accounts, account)

      const spendNote = minerTransaction.getNote(0).decryptNoteForOwner(account.incomingViewKey)
      Assert.isNotUndefined(spendNote)
      for (let i = 0; i < minerTransaction.notesLength(); i++) {
        const note = minerTransaction.getNote(i)
        await tree.add(note)
      }

      const authPath = (await tree.witness(0))?.authenticationPath
      Assert.isNotUndefined(authPath)

      const task = new CreateTransactionTask()
      const request = new CreateTransactionRequest(
        account.spendingKey,
        BigInt(1),
        15,
        [
          {
            note: spendNote.serialize(),
            treeSize: await tree.size(),
            rootHash: await tree.rootHash(),
            authPath,
          },
        ],
        [{ publicAddress: account.publicAddress, amount: BigInt(1), memo: '' }],
      )

      const response = task.execute(request)
      expect(postTransaction).toHaveBeenCalled()
      expect(receiveTransaction).toHaveBeenCalled()
      expect(spendTransaction).toHaveBeenCalled()
      expect(response).toEqual(
        new CreateTransactionResponse(mockSerializedTransactionPosted, response.jobId),
      )
    })
  })
})
