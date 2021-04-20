/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import * as blockHeaderModule from '../primitives/blockheader'
import mineBatch from './mineHeaderTask'
import { mocked } from 'ts-jest/utils'

jest.mock('../primitives/blockheader')

describe('Mine header tasks', () => {
  beforeEach(() => {
    mocked(blockHeaderModule.hashBlockHeader).mockReset()
  })

  it('attempt batch size times', () => {
    const targetTooBig = Buffer.alloc(8)
    targetTooBig[0] = 10
    mocked(blockHeaderModule.hashBlockHeader).mockReturnValue(targetTooBig)

    const result = mineBatch({
      headerBytesWithoutRandomness: Buffer.alloc(8),
      initialRandomness: 42,
      targetValue: '0',
      batchSize: 10,
      miningRequestId: 1,
    })

    expect(result).toStrictEqual({ initialRandomness: 42 })
    expect(blockHeaderModule.hashBlockHeader).toBeCalledTimes(10)
  })
  it('finds the randomness', () => {
    const targetTooBig = Buffer.alloc(8)
    targetTooBig[0] = 10
    mocked(blockHeaderModule.hashBlockHeader)
      .mockReturnValueOnce(targetTooBig)
      .mockReturnValueOnce(targetTooBig)
      .mockReturnValueOnce(targetTooBig)
      .mockReturnValue(Buffer.alloc(0))

    const result = mineBatch({
      headerBytesWithoutRandomness: Buffer.alloc(0),
      initialRandomness: 42,
      targetValue: '100',
      batchSize: 10,
      miningRequestId: 2,
    })

    expect(result).toStrictEqual({ initialRandomness: 42, randomness: 45, miningRequestId: 2 })
    expect(blockHeaderModule.hashBlockHeader).toBeCalledTimes(4)
  })
  it('wraps the randomness', () => {
    const targetTooBig = Buffer.alloc(8)
    targetTooBig[0] = 10
    mocked(blockHeaderModule.hashBlockHeader)
      .mockReturnValueOnce(targetTooBig)
      .mockReturnValueOnce(targetTooBig)
      .mockReturnValueOnce(targetTooBig)
      .mockReturnValueOnce(targetTooBig)
      .mockReturnValue(Buffer.alloc(0))

    const result = mineBatch({
      headerBytesWithoutRandomness: Buffer.alloc(0),
      initialRandomness: Number.MAX_SAFE_INTEGER - 1,
      targetValue: '0',
      batchSize: 10,
      miningRequestId: 3,
    })

    expect(result).toStrictEqual({
      initialRandomness: Number.MAX_SAFE_INTEGER - 1,
      randomness: 2,
      miningRequestId: 3,
    })
    expect(blockHeaderModule.hashBlockHeader).toBeCalledTimes(5)
  })
})
