/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../../../assert'
import { Transaction } from '../../../primitives'
import { useBlockWithTx } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route chain/getBlocks', () => {
  const routeTest = createRouteTest(true)
  let genesisHash = ''
  let block2Hash = ''
  let block3Hash = ''

  beforeAll(async () => {
    // Create a 3 block chain
    const { chain, node } = routeTest

    const { previous: block2, block: block3 } = await useBlockWithTx(node)
    await chain.addBlock(block3)

    genesisHash = chain.genesis.hash.toString('hex')
    block2Hash = block2.header.hash.toString('hex')
    block3Hash = block3.header.hash.toString('hex')
  })

  it('Returns blocks in range', async () => {
    const response = await routeTest.client.chain.getBlocks({ start: 1, end: 3 })
    expect(response.content.blocks).toHaveLength(3)
    expect(response.content.blocks[0]).toMatchObject({
      block: {
        hash: genesisHash,
        sequence: 1,
      },
    })
    expect(response.content.blocks[1]).toMatchObject({
      block: {
        hash: block2Hash,
        sequence: 2,
      },
    })
    expect(response.content.blocks[2]).toMatchObject({
      block: {
        hash: block3Hash,
        sequence: 3,
      },
    })
    expect(response.content.blocks[2].block.transactions[0].fee).toBe(-2000000001)
  })

  it('Returns at most latest block if requesting blocks past end of the chain', async () => {
    const response = await routeTest.client.chain.getBlocks({ start: 2, end: 5 })
    expect(response.content.blocks).toHaveLength(2)
    expect(response.content.blocks[0]).toMatchObject({
      block: {
        hash: block2Hash,
        sequence: 2,
      },
    })
    expect(response.content.blocks[1]).toMatchObject({
      block: {
        hash: block3Hash,
        sequence: 3,
      },
    })
  })

  it('Returns 1 block when start equals end', async () => {
    const response = await routeTest.client.chain.getBlocks({ start: 2, end: 2 })
    expect(response.content.blocks).toHaveLength(1)
    expect(response.content.blocks[0]).toMatchObject({
      block: {
        hash: block2Hash,
        sequence: 2,
      },
    })
  })

  it('Errors when requesting end before start', async () => {
    await expect(routeTest.client.chain.getBlocks({ start: 3, end: 2 })).rejects.toThrow(
      'end must be greater than or equal to start',
    )
  })

  it('Negative ranges start from end of chain', async () => {
    const response = await routeTest.client.chain.getBlocks({ start: -1, end: 0 })
    expect(response.content.blocks).toHaveLength(2)
    expect(response.content.blocks[0]).toMatchObject({
      block: {
        hash: block2Hash,
        sequence: 2,
      },
    })
    expect(response.content.blocks[1]).toMatchObject({
      block: {
        hash: block3Hash,
        sequence: 3,
      },
    })
  })

  it('Returns serialized transactions when serialized is true', async () => {
    let response = await routeTest.client.chain.getBlocks({ start: 3, end: 3 })
    expect(response.content.blocks).toHaveLength(1)
    expect(response.content.blocks[0]).toMatchObject({
      block: {
        hash: block3Hash,
        sequence: 3,
      },
    })
    expect(response.content.blocks[0].block.transactions[0].serialized).toBeUndefined()

    response = await routeTest.client.chain.getBlocks({ start: 3, end: 3, serialized: true })
    expect(response.content.blocks).toHaveLength(1)
    expect(response.content.blocks[0]).toMatchObject({
      block: {
        hash: block3Hash,
        sequence: 3,
      },
    })
    expect(typeof response.content.blocks[0].block.transactions[0].serialized).toBe('string')

    Assert.isNotUndefined(response.content.blocks[0].block.transactions[0].serialized)
    const txn = new Transaction(
      Buffer.from(response.content.blocks[0].block.transactions[0].serialized, 'hex'),
    )
    expect(txn.fee().toString()).toBe('-2000000001')
  })
})
