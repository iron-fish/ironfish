/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { mocked } from 'ts-jest/utils'
import * as typeorm from 'typeorm'
import { networkIdentifier as networkIdentifierConfig } from '../config'
import { RequestHandlerParams } from '../middleware'
import { BlockIdentifier, BlockRequest, NetworkIdentifier } from '../types'

const findWithInstances = jest.fn().mockReturnValue(null)
jest.mock('../repository/BlockRepository', () => ({
  findWithInstances,
}))
jest.mock('typeorm', () => {
  const moduleMock = jest.requireActual<typeof typeorm>('typeorm')
  return {
    ...moduleMock,
    getCustomRepository: jest.fn().mockReturnValue({ findWithInstances }),
  }
})

import { Block } from './Block'

describe('Blocks service', () => {
  const getRequestHander = (
    blockIdentifier: BlockIdentifier,
    networkIdentifier: NetworkIdentifier,
  ): RequestHandlerParams<BlockRequest> => ({
    params: {
      network_identifier: networkIdentifier,
      block_identifier: blockIdentifier,
    },
  })

  it('fails without the right network identifier', async () => {
    await expect(
      Block(getRequestHander({} as BlockIdentifier, {} as NetworkIdentifier)),
    ).rejects.toThrow('Network identifier is not valid')
  })

  it('fails without the right block identifier', async () => {
    await expect(
      Block(getRequestHander({} as BlockIdentifier, networkIdentifierConfig)),
    ).rejects.toThrow('Block identifier is not valid')
  })

  it('fails if block does not exists', async () => {
    await expect(
      Block(getRequestHander({ hash: 'abcd' } as BlockIdentifier, networkIdentifierConfig)),
    ).rejects.toThrow('Block data not found')
  })

  describe('with a block returned', () => {
    beforeEach(() => {
      mocked(findWithInstances).mockReturnValue({
        hash: 'hash2',
        sequence: 2,
        transactions: [],
        previousBlock: {
          hash: 'hash1',
          sequence: 1,
        },
        timestamp: 123,
        metadata: {},
      })
    })

    it('returns the right response', async () => {
      const response = await Block(
        getRequestHander({ hash: 'abcd' } as BlockIdentifier, networkIdentifierConfig),
      )
      expect(response).toEqual({
        block: {
          block_identifier: {
            hash: 'hash2',
            index: 2,
          },
          parent_block_identifier: {
            hash: 'hash1',
            index: 1,
          },
          timestamp: 123,
          metadata: {},
          transactions: [],
        },
      })
    })
  })
})
