/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useMinerBlockFixture } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { RpcRequestError } from '../../clients'
import { GetTransactionResponse } from './getTransaction'
import { RpcSpend } from './types'

describe('Route chain/getTransaction', () => {
  const routeTest = createRouteTest()

  it('returns transaction by transaction hash only', async () => {
    const { chain } = routeTest

    const block2 = await useMinerBlockFixture(chain)
    await expect(chain).toAddBlock(block2)

    const transaction = block2.transactions[0]

    const notesEncrypted: string[] = []
    const notes: { hash: string; serialized: string }[] = []

    for (const note of transaction.notes) {
      notesEncrypted.push(note.serialize().toString('hex'))
      notes.push({
        hash: note.hash().toString('hex'),
        serialized: note.serialize().toString('hex'),
      })
    }

    const response = await routeTest.client
      .request<GetTransactionResponse>('chain/getTransaction', {
        transactionHash: transaction.hash().toString('hex'),
      })
      .waitForEnd()

    const spends: RpcSpend[] = transaction.spends.map((spend) => ({
      nullifier: spend.nullifier.toString('hex'),
      commitment: spend.commitment.toString('hex'),
      size: spend.size,
    }))

    expect(response.content).toMatchObject({
      fee: Number(transaction.fee()),
      expiration: transaction.expiration(),
      notesCount: 1,
      spendsCount: 0,
      signature: transaction.transactionSignature().toString('hex'),
      notesEncrypted,
      spends,
      mints: [],
      burns: [],
      notes,
    })
  })

  it('returns transaction by block hash and transaction hash', async () => {
    const { chain } = routeTest

    const block2 = await useMinerBlockFixture(chain)
    await expect(chain).toAddBlock(block2)

    const transaction = block2.transactions[0]

    const notesEncrypted: string[] = []
    const notes: { hash: string; serialized: string }[] = []

    for (const note of transaction.notes) {
      notesEncrypted.push(note.serialize().toString('hex'))
      notes.push({
        hash: note.hash().toString('hex'),
        serialized: note.serialize().toString('hex'),
      })
    }

    const response = await routeTest.client
      .request<GetTransactionResponse>('chain/getTransaction', {
        blockHash: block2.header.hash.toString('hex'),
        transactionHash: transaction.hash().toString('hex'),
      })
      .waitForEnd()

    const spends: RpcSpend[] = transaction.spends.map((spend) => ({
      nullifier: spend.nullifier.toString('hex'),
      commitment: spend.commitment.toString('hex'),
      size: spend.size,
    }))

    expect(response.content).toMatchObject({
      fee: Number(transaction.fee()),
      expiration: transaction.expiration(),
      notesCount: 1,
      spendsCount: 0,
      signature: transaction.transactionSignature().toString('hex'),
      notesEncrypted,
      spends,
      mints: [],
      burns: [],
      notes,
    })
  })

  it('throws an error if the transaction is not found on the block', async () => {
    const { chain } = routeTest

    const block2 = await useMinerBlockFixture(chain)
    await expect(chain).toAddBlock(block2)

    const block3 = await useMinerBlockFixture(chain)
    await expect(chain).toAddBlock(block3)

    const transaction = block2.transactions[0]

    await expect(
      async () =>
        await routeTest.client
          .request<GetTransactionResponse>('chain/getTransaction', {
            transactionHash: transaction.hash().toString('hex'),
            blockHash: block3.header.hash.toString('hex'),
          })
          .waitForEnd(),
    ).rejects.toThrow(RpcRequestError)
  })

  it('throws an error if no transaction hash is provided', async () => {
    await expect(
      async () =>
        await routeTest.client
          .request<GetTransactionResponse>('chain/getTransaction', {})
          .waitForEnd(),
    ).rejects.toThrow(RpcRequestError)
  })

  it('throws an error if no block is found', async () => {
    await expect(
      async () =>
        await routeTest.client
          .request<GetTransactionResponse>('chain/getTransaction', {
            transactionHash: 'deadbeef',
            blockHash: 'deadbeef',
          })
          .waitForEnd(),
    ).rejects.toThrow(RpcRequestError)
  })

  it('throws an error if transaction does not have a block hash', async () => {
    await expect(
      async () =>
        await routeTest.client
          .request<GetTransactionResponse>('chain/getTransaction', {
            transactionHash: 'deadbeef',
          })
          .waitForEnd(),
    ).rejects.toThrow(RpcRequestError)
  })
})
