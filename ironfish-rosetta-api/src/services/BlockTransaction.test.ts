/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { mocked } from 'ts-jest/utils'
import * as typeorm from 'typeorm'

import { networkIdentifier as networkIdentifierConfig } from '../config'
import { BlockIdentifier, NetworkIdentifier, TransactionIdentifier } from '../types'

const findWithInstances = jest.fn().mockReturnValue(null)
jest.mock('../repository/TransactionRepository', () => ({
  findWithInstances,
}))
jest.mock('typeorm', () => {
  const moduleMock = jest.requireActual<typeof typeorm>('typeorm')
  return {
    ...moduleMock,
    getCustomRepository: jest.fn().mockReturnValue({ findWithInstances }),
  }
})

import { BlockTransaction } from './BlockTransaction'

describe('Block Transaction service', () => {
  it('fails without the right network identifier', async () => {
    await expect(
      BlockTransaction({
        params: {
          transaction_identifier: {} as TransactionIdentifier,
          block_identifier: {} as BlockIdentifier,
          network_identifier: {} as NetworkIdentifier,
        },
      }),
    ).rejects.toThrow('Network identifier is not valid')
  })

  it('fails if transaction does not exists', async () => {
    await expect(
      BlockTransaction({
        params: {
          transaction_identifier: { hash: 'abcd' },
          block_identifier: { hash: 'abcd', index: 2 },
          network_identifier: networkIdentifierConfig,
        },
      }),
    ).rejects.toThrow('Transaction data not found')
  })

  describe('with a transaction returned', () => {
    beforeEach(() => {
      mocked(findWithInstances).mockReturnValue({
        block: { timestamp: Date.now() },
        hash: 'B89726C5FA28FBB7B928F9697015616850618B5F5085E02DC08A98246003D144',
        notes: [
          {
            commitment: '468b79919960c8c5505be558e0f7d7353639dc3de8ea35c441e9e820b904bf6c',
          },
          {
            commitment: '6364fed24976a6b5c3f2e15a595786805f70375fe38489f8464f8a98c6957f00',
          },
        ],
        spends: [
          {
            nullifier: '42BC2C20C1B31C2E38A65A6A27204B3DC86B4ED11C4EFDC3D9E933CCADE385DD',
          },
        ],
        size: 5005,
        fee: 0,
      })
    })

    it('returns the right response', async () => {
      const response = await BlockTransaction({
        params: {
          transaction_identifier: {
            hash: 'B89726C5FA28FBB7B928F9697015616850618B5F5085E02DC08A98246003D144',
          },
          block_identifier: { hash: 'abcd', index: 2 },
          network_identifier: networkIdentifierConfig,
        },
      })
      expect(response.transaction.transaction_identifier.hash).toEqual(
        'B89726C5FA28FBB7B928F9697015616850618B5F5085E02DC08A98246003D144',
      )
    })
  })
})
