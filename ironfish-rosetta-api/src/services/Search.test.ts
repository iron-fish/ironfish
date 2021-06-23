/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { mocked } from 'ts-jest/utils'
import * as typeorm from 'typeorm'
import { networkIdentifier as networkIdentifierConfig } from '../config'
import { NetworkIdentifier } from '../types'

const find = jest.fn().mockReturnValue(null)
jest.mock('../repository/BlockRepository', () => ({
  find,
}))
const findTransactions = jest.fn().mockReturnValue(null)
jest.mock('../repository/TransactionRepository', () => ({
  find: findTransactions,
}))
jest.mock('typeorm', () => {
  const moduleMock = jest.requireActual<typeof typeorm>('typeorm')
  return {
    ...moduleMock,
    getCustomRepository: jest.fn().mockReturnValue({ find }),
  }
})

import { SearchBlocks } from './Search'

describe('SearchBlocks', () => {
  it('fails without the right network identifier', async () => {
    await expect(
      SearchBlocks({
        params: {
          network_identifier: {} as NetworkIdentifier,
        },
      }),
    ).rejects.toThrow('Network identifier is not valid')
  })

  describe('with blocks returned', () => {
    beforeEach(() => {
      find.mockReset()
      mocked(find).mockReturnValue([
        {
          hash: 'hash2',
          sequence: 2,
          transactions: [],
          previousBlock: {
            hash: 'hash1',
            sequence: 1,
          },
          timestamp: 123,
          metadata: {},
        },
      ])
    })

    it('returns the latest blocks', async () => {
      const response = await SearchBlocks({
        params: {
          limit: 10,
          network_identifier: networkIdentifierConfig,
        },
      })
      expect(find).toBeCalledWith({ order: { sequence: 'DESC' }, take: 10, where: [{}] })
      expect(response.blocks.length).toEqual(1)
      expect(response.next_offset).toEqual(2)
    })

    it('filters by hash when string', async () => {
      await SearchBlocks({
        params: {
          limit: 10,
          query: 'abcd',
          network_identifier: networkIdentifierConfig,
        },
      })
      expect(find).toBeCalledWith({
        order: { sequence: 'DESC' },
        take: 10,
        where: [
          {
            hash: {
              _getSql: undefined,
              _multipleParameters: false,
              _objectLiteralParameters: undefined,
              _type: 'like',
              _useParameter: true,
              _value: '%abcd%',
            },
          },
        ],
      })
    })
  })

  it('filters by sequence when number', async () => {
    await SearchBlocks({
      params: {
        limit: 10,
        query: '12',
        network_identifier: networkIdentifierConfig,
      },
    })
    expect(find).toBeCalledWith({
      order: { sequence: 'DESC' },
      take: 10,
      where: [
        {
          sequence: 12,
        },
      ],
    })
  })
})
