/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../../../assert'
import { useBlockWithTx, useMinerBlockFixture } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { RPC_ERROR_CODES } from '../../adapters'

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
    let response = await routeTest.client.chain.getBlock({ search: hash2 })
    expect(response.content).toMatchObject({
      block: {
        hash: hash2,
        sequence: 3,
      },
    })

    // Now miss on a hash check
    await expect(
      routeTest.client.chain.getBlock({
        search: '123405c7492bd000d6a8312f7592737e869967c890aac22247ede00678d4a2b2',
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        status: 404,
        code: RPC_ERROR_CODES.NOT_FOUND,
        message: expect.stringContaining('No block found with hash'),
      }),
    )

    // Find block matching sequence
    response = await routeTest.client.chain.getBlock({ search: '2' })
    expect(response.content).toMatchObject({
      block: {
        hash: hash1,
        sequence: 2,
      },
    })

    // Find block matching sequence
    response = await routeTest.client.chain.getBlock({ search: '-1' })
    expect(response.content).toMatchObject({
      block: {
        hash: hash2,
        sequence: 3,
      },
    })

    // Now miss on a sequence check
    await expect(routeTest.client.chain.getBlock({ search: '1234' })).rejects.toThrow(
      expect.objectContaining({
        status: 404,
        code: RPC_ERROR_CODES.NOT_FOUND,
        message: expect.stringContaining('No block found with sequence'),
      }),
    )

    // Force failure of getBlock()
    jest.spyOn(chain, 'getBlock').mockResolvedValue(null)
    await expect(routeTest.client.chain.getBlock({ search: hash0 })).rejects.toThrow(
      expect.objectContaining({
        status: 404,
        code: RPC_ERROR_CODES.NOT_FOUND,
        message: expect.stringContaining('No block with header'),
      }),
    )
  })

  it('Receives transactions from a matched block', async () => {
    // Create separate test case for showing transactions
    const { node } = routeTest

    const { block } = await useBlockWithTx(node)
    await expect(node.chain).toAddBlock(block)
    const hash = block.header.hash.toString('hex')

    const response = await routeTest.client.chain.getBlock({ search: '3' })
    expect(response.content).toMatchObject({
      block: {
        hash: hash,
        sequence: 3,
      },
    })

    expect(response.content.block.transactions[0].fee).toBe(-2000000001)
  })

  it('has block confirmation status', async () => {
    const { node } = routeTest

    const { block } = await useBlockWithTx(node)
    await expect(node.chain).toAddBlock(block)
    const hash = block.header.hash.toString('hex')

    const response = await routeTest.client.chain.getBlock({ search: '3' })
    expect(response.content).toMatchObject({
      block: {
        hash: hash,
        sequence: 3,
      },
      metadata: {
        confirmed: true,
      },
    })

    const unconfirmedResponse = await routeTest.client.chain.getBlock({
      search: '3',
      confirmations: 10,
    })
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

  it('serializes transactions when requested', async () => {
    const { node } = routeTest

    const { block, transaction } = await useBlockWithTx(node)
    await expect(node.chain).toAddBlock(block)

    const response = await routeTest.client.chain.getBlock({ search: '3', serialized: true })
    const serialized = response.content.block.transactions[1].serialized
    Assert.isNotUndefined(serialized)
    expect(Buffer.from(serialized, 'hex')).toEqual(transaction.serialize())
  })
})
