/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { createRouteTest } from '../../../testUtilities/routeTest'
import { RangeHasher } from '../../../merkletree'

import { blockHash, makeFakeBlock, TestStrategy } from '../../../testUtilities/fake'
import { GetChainInfoResponse } from './getChainInfo'
import { BlockHashSerdeInstance } from '../../../serde'

describe('Route chain.getChainInfo', () => {
  const routeTest = createRouteTest()
  const date = new Date()
  const strategy = new TestStrategy(new RangeHasher())
  const genesis = Buffer.from('genesis1234')
  const latestHeader = makeFakeBlock(strategy, blockHash(1), blockHash(2), 1, 1, 1).header
  const heaviestHeader = makeFakeBlock(strategy, blockHash(2), blockHash(3), 1, 1, 1).header

  beforeAll(() => {
    routeTest.node.chain.getAtSequence = jest.fn().mockReturnValue([genesis])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    routeTest.node.chain.latest = latestHeader as any

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    routeTest.node.chain.head = heaviestHeader as any

    jest
      .spyOn(BlockHashSerdeInstance, 'serialize')
      .mockImplementation((value) => value.toString())

    routeTest.node.chain.headers.get = jest.fn().mockImplementation((hash: Buffer) => {
      if (hash.equals(latestHeader.hash)) {
        return {
          sequence: latestHeader.sequence,
          hash: latestHeader.hash,
          timestamp: date.getTime(),
        }
      }
      if (hash.equals(heaviestHeader.hash)) {
        return {
          sequence: heaviestHeader.sequence,
          hash: heaviestHeader.hash,
        }
      }
    })
  })

  it('returns the right object with hash', async () => {
    const response = await routeTest.adapter.request('chain/getChainInfo', {})

    const content = response.content as GetChainInfoResponse

    expect(content.currentBlockIdentifier.index).toEqual(latestHeader.sequence.toString())
    expect(content.genesisBlockIdentifier.index).toEqual('1')
    expect(content.oldestBlockIdentifier.index).toEqual(heaviestHeader.sequence.toString())
    expect(content.currentBlockTimestamp).toEqual(Number(latestHeader.timestamp))
  })
})
