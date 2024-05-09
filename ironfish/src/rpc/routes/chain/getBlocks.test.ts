/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useBlockWithTx, useMinerBlockFixture } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { RPC_ERROR_CODES } from '../../adapters'

describe('Route chain/getBlocks', () => {
  const routeTest = createRouteTest()

  it('Processes sequence inputs', async () => {
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

    // Find block matching request sequence range
    let response = await routeTest.client.chain.getBlocks({ start: 1, end: 4 })
    expect(response.content.blocks).toHaveLength(3)
    const blocks = response.content.blocks
    expect(blocks[0]).toMatchObject({
      block: {
        hash: hash0,
        sequence: 1,
      },
    })
    expect(blocks[1]).toMatchObject({
      block: {
        hash: hash1,
        sequence: 2,
      },
    })
    expect(blocks[2]).toMatchObject({
      block: {
        hash: hash2,
        sequence: 3,
      },
    })

    // Now miss on a unexpected block sequence
    await expect(
      routeTest.client.chain.getBlocks({
        start: 5,
        end: 6,
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        status: 404,
        code: RPC_ERROR_CODES.NOT_FOUND,
        message: expect.stringContaining('No block found with sequence'),
      }),
    )

    // Find block with negative start sequence
    response = await routeTest.client.chain.getBlocks({ start: -1, end: 2 })
    expect(response.content.blocks).toHaveLength(1)
    expect(response.content.blocks[0]).toMatchObject({
      block: {
        hash: hash0,
        sequence: 1,
      },
    })
  })

  it('Receives transactions from a matched block', async () => {
    // Create separate test case for showing transactions
    const { node } = routeTest

    const { block } = await useBlockWithTx(node)
    await expect(node.chain).toAddBlock(block)
    const hash = block.header.hash.toString('hex')

    const response = await routeTest.client.chain.getBlocks({ start: 3, end: 4 })
    expect(response.content.blocks).toHaveLength(1)
    expect(response.content.blocks[0]).toMatchObject({
      block: {
        hash: hash,
        sequence: 3,
      },
    })

    expect(response.content.blocks[0].block.transactions[0].fee).toBe(-2000000001)
  })
})
