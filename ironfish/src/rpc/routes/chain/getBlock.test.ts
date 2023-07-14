/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useBlockWithTx, useMinerBlockFixture } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { ERROR_CODES } from '../../adapters'
import { RpcRequestError } from '../../clients/errors'
import { Response as GetBlockResponse } from './getBlock'

describe('Route chain/getBlock', () => {
  const routeTest = createRouteTest()

  it('Processes hash and sequence inputs', async () => {
    // Create a 3 block chain
    const { chain } = routeTest
    await chain.open()

    const blockA1 = await useMinerBlockFixture(chain)
    await expect(chain).toAddBlock(blockA1)
    const blockA2 = await useMinerBlockFixture(chain)
    await expect(chain).toAddBlock(blockA2)

    // Get hash of blocks
    const hash0 = chain.genesis.hash.toString('hex')
    const hash1 = blockA1.header.hash.toString('hex')
    const hash2 = blockA2.header.hash.toString('hex')

    // Find block matching hash
    let response = await routeTest.client
      .request<GetBlockResponse>('chain/getBlock', { search: hash2 })
      .waitForEnd()

    expect(response.content).toMatchObject({
      block: {
        hash: hash2,
        sequence: 3,
      },
    })

    // Now miss on a hash check
    try {
      await routeTest.client
        .request<GetBlockResponse>('chain/getBlock', {
          search: '123405c7492bd000d6a8312f7592737e869967c890aac22247ede00678d4a2b2',
        })
        .waitForEnd()
    } catch (e: unknown) {
      if (!(e instanceof RpcRequestError)) {
        throw e
      }
      expect(e.status).toBe(400)
      expect(e.code).toBe(ERROR_CODES.VALIDATION)
      expect(e.message).toContain('No block found with hash')
    }

    // Find block matching sequence
    response = await routeTest.client
      .request<GetBlockResponse>('chain/getBlock', { search: '2' })
      .waitForEnd()

    expect(response.content).toMatchObject({
      block: {
        hash: hash1,
        sequence: 2,
      },
    })

    // Find block matching sequence
    response = await routeTest.client
      .request<GetBlockResponse>('chain/getBlock', { search: '-1' })
      .waitForEnd()

    expect(response.content).toMatchObject({
      block: {
        hash: hash2,
        sequence: 3,
      },
    })

    // Now miss on a sequence check
    try {
      await routeTest.client
        .request<GetBlockResponse>('chain/getBlock', { search: '1234' })
        .waitForEnd()
    } catch (e: unknown) {
      if (!(e instanceof RpcRequestError)) {
        throw e
      }
      expect(e.status).toBe(400)
      expect(e.code).toBe(ERROR_CODES.VALIDATION)
      expect(e.message).toContain('No block found with sequence')
    }

    // Force failure of getBlock()
    jest.spyOn(chain, 'getBlock').mockResolvedValue(null)

    try {
      await routeTest.client
        .request<GetBlockResponse>('chain/getBlock', { search: hash0 })
        .waitForEnd()
    } catch (e: unknown) {
      if (!(e instanceof RpcRequestError)) {
        throw e
      }
      expect(e.status).toBe(400)
      expect(e.code).toBe(ERROR_CODES.VALIDATION)
      expect(e.message).toContain('No block with header')
    }
  })

  it('Receives transactions from a matched block', async () => {
    // Create separate test case for showing transactions
    const { node } = routeTest

    const { block } = await useBlockWithTx(node)
    await expect(node.chain).toAddBlock(block)
    const hash = block.header.hash.toString('hex')

    const response = await routeTest.client
      .request<GetBlockResponse>('chain/getBlock', { search: '3' })
      .waitForEnd()

    expect(response.content).toMatchObject({
      block: {
        hash: hash,
        sequence: 3,
      },
    })

    expect(response.content.block.transactions[0].fee).toBe('-2000000001')
  })

  it('has block confirmation status', async () => {
    const { node } = routeTest

    const { block } = await useBlockWithTx(node)
    await expect(node.chain).toAddBlock(block)
    const hash = block.header.hash.toString('hex')

    const response = await routeTest.client
      .request<GetBlockResponse>('chain/getBlock', { search: '3' })
      .waitForEnd()

    expect(response.content).toMatchObject({
      block: {
        hash: hash,
        sequence: 3,
      },
      metadata: {
        confirmed: true,
      },
    })

    const unconfirmedResponse = await routeTest.client
      .request<GetBlockResponse>('chain/getBlock', { search: '3', confirmations: 10 })
      .waitForEnd()

    expect(unconfirmedResponse.content).toMatchObject({
      block: {
        hash: hash,
        sequence: 3,
      },
      metadata: {
        confirmed: false,
      },
    })
  })
})
