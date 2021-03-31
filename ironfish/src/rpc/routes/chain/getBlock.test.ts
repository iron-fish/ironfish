/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { createRouteTest } from '../test'
import { RangeHasher } from '../../../captain'
import { makeFakeBlock, TestStrategy, TestTransaction } from '../../../captain/testUtilities'

describe('Route chain.getBlock', () => {
  const genesisHashBuffer = Buffer.alloc(32, 'genesis')
  const parentHashBuffer = Buffer.alloc(32, 'parent')
  const currentHashBuffer = Buffer.alloc(32, 'current')
  const routeTest = createRouteTest()
  const mock = jest.fn()
  const strategy = new TestStrategy(new RangeHasher())
  const blockParent = makeFakeBlock(strategy, genesisHashBuffer, parentHashBuffer, 1, 1, 2)
  const block = makeFakeBlock(strategy, parentHashBuffer, currentHashBuffer, 2, 3, 5)

  block.transactions = [
    new TestTransaction(true, [], 5, [
      { nullifier: Buffer.alloc(32), commitment: 'One', size: 1 },
    ]),
  ]

  beforeAll(() => {
    mock.mockImplementation((hash: Buffer) => {
      if (hash.equals(currentHashBuffer)) {
        return block
      }
      if (hash.equals(parentHashBuffer)) {
        return blockParent
      }
    })

    routeTest.node.captain.strategy.transactionSerde = jest.fn().mockReturnValue({
      serialize: jest.fn(() => 'transactionSerialized'),
    })
    routeTest.node.captain.chain.getBlock = mock
    routeTest.node.captain.chain.getAtSequence = jest
      .fn()
      .mockImplementation((sequence: BigInt) =>
        sequence === BigInt(2) ? [currentHashBuffer] : [],
      )
    routeTest.node.captain.blockSerde.serialize = jest.fn().mockReturnValue('block')
    routeTest.node.captain.chain.blockHashSerde.serialize = jest.fn((value) => value.toString())
    routeTest.node.captain.chain.blockHashSerde.deserialize = jest.fn((value) =>
      Buffer.from(value),
    )
  })

  it('should fail if no sequence or hash provided', async () => {
    await expect(routeTest.adapter.request('chain/getBlock', {})).rejects.toThrow(
      'Missing hash or sequence',
    )
  })

  it(`should fail if block can't be found with hash`, async () => {
    await expect(
      routeTest.adapter.request('chain/getBlock', { hash: 'blockHashNotFound' }),
    ).rejects.toThrow('No block found')
  })

  it(`should fail if block can't be found with sequence`, async () => {
    await expect(routeTest.adapter.request('chain/getBlock', { index: 5 })).rejects.toThrow(
      'No block found',
    )
  })

  it('returns the right object with hash', async () => {
    const response = await routeTest.adapter.request('chain/getBlock', {
      hash: currentHashBuffer.toString(),
    })
    // called the node for the current block
    expect(mock).toHaveBeenCalledWith(currentHashBuffer)
    // called the node for the parent block
    expect(mock).toHaveBeenCalledWith(parentHashBuffer)

    expect(response.content).toMatchSnapshot()
  })

  it('returns the right object with sequence', async () => {
    const response = await routeTest.adapter.request('chain/getBlock', { index: 2 })
    expect(response.content).toMatchSnapshot()
  })
})
