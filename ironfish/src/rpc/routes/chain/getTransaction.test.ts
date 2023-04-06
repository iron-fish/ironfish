/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useMinerBlockFixture } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { CurrencyUtils } from '../../../utils'
import { RpcRequestError } from '../../clients'
import { GetTransactionResponse } from './getTransaction'

describe('Route chain/getTransaction', () => {
  const routeTest = createRouteTest()

  it('returns transaction by transaction hash only', async () => {
    const { chain } = routeTest

    const block2 = await useMinerBlockFixture(chain)
    await expect(chain).toAddBlock(block2)

    const transaction = block2.transactions[0]

    const notesEncrypted: string[] = []

    for (const note of transaction.notes) {
      notesEncrypted.push(note.serialize().toString('hex'))
    }

    const response = await routeTest.client
      .request<GetTransactionResponse>('chain/getTransaction', {
        transactionHash: transaction.hash().toString('hex'),
      })
      .waitForEnd()

    expect(response.content).toMatchObject({
      fee: CurrencyUtils.encode(transaction.fee()),
      expiration: transaction.expiration(),
      notesCount: 1,
      spendsCount: 0,
      signature: transaction.transactionSignature().toString('hex'),
      notesEncrypted,
      mints: [],
      burns: [],
    })
  })

  it('returns transaction by block hash and transaction hash', async () => {
    const { chain } = routeTest

    const block2 = await useMinerBlockFixture(chain)
    await expect(chain).toAddBlock(block2)

    const transaction = block2.transactions[0]

    const notesEncrypted: string[] = []

    for (const note of transaction.notes) {
      notesEncrypted.push(note.serialize().toString('hex'))
    }

    const response = await routeTest.client
      .request<GetTransactionResponse>('chain/getTransaction', {
        blockHash: block2.header.hash.toString('hex'),
        transactionHash: transaction.hash().toString('hex'),
      })
      .waitForEnd()

    expect(response.content).toMatchObject({
      fee: CurrencyUtils.encode(transaction.fee()),
      expiration: transaction.expiration(),
      notesCount: 1,
      spendsCount: 0,
      signature: transaction.transactionSignature().toString('hex'),
      notesEncrypted,
      mints: [],
      burns: [],
    })
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
