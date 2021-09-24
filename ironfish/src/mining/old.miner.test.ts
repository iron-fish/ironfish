/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { mocked } from 'ts-jest/utils'
import * as blockHeaderModule from '../primitives/blockheader'
import Miner, { mineHeader } from './miner'
jest.mock('../primitives/blockheader')

/**
 * Make an iterable of blocks suitable for async generation
 *
 * If waitAfter is supplied, it won't return an exhausted stream
 * until that promise completes. This is useful for tests that
 * need to wait for an event to happen before the stream exhausts.
 */
async function* makeAsync(
  array: {
    bytes: { type: 'Buffer'; data: number[] }
    target: string
    miningRequestId: number
  }[],
  waitAfter = Promise.resolve(),
) {
  for (const block of array) {
    yield block
  }

  await waitAfter
}

describe('Miner', () => {
  it('mines', async () => {
    const miner = new Miner(1)

    const mineHeaderSpy = jest.spyOn(miner.workerPool, 'mineHeader')
    const stopSpy = jest.spyOn(miner.workerPool, 'stop')

    const successfullyMined = jest.fn()

    await miner.mine(
      makeAsync([
        {
          bytes: { type: 'Buffer', data: [] },
          target: '0',
          miningRequestId: 1,
        },
      ]),
      successfullyMined,
    )

    expect(mineHeaderSpy).toBeCalled()
    expect(stopSpy).toBeCalled()
    expect(successfullyMined).not.toBeCalled()
  })

  it('reschedules on new block', async () => {
    const miner = new Miner(1)

    const mineHeaderSpy = jest.spyOn(miner.workerPool, 'mineHeader')
    const stopSpy = jest.spyOn(miner.workerPool, 'stop')

    const successfullyMined = jest.fn()

    await miner.mine(
      makeAsync([
        {
          bytes: { type: 'Buffer', data: [] },
          target: '0',
          miningRequestId: 2,
        },
        {
          bytes: { type: 'Buffer', data: [] },
          target: '0',
          miningRequestId: 3,
        },
        {
          bytes: { type: 'Buffer', data: [] },
          target: '0',
          miningRequestId: 4,
        },
      ]),
      successfullyMined,
    )

    expect(mineHeaderSpy).toBeCalledTimes(3)
    expect(stopSpy).toBeCalled()
    expect(successfullyMined).not.toBeCalled()
  })

  it('calls successfullyMined', async () => {
    const miner = new Miner(1)
    jest
      .spyOn(miner.workerPool, 'mineHeader')
      .mockImplementation((_id, _bytes, initialRandomness, _targetValue, _batchSize) => {
        return Promise.resolve({
          initialRandomness: initialRandomness,
          randomness: 5,
          miningRequestId: 10,
        })
      })

    const successfullyMined = jest.fn()

    await miner.mine(
      makeAsync([
        {
          bytes: { type: 'Buffer', data: [] },
          target: '0',
          miningRequestId: 2,
        },
      ]),
      successfullyMined,
    )
    expect(successfullyMined).toBeCalledTimes(1)
  })
})

describe('mineHeader', () => {
  beforeEach(() => {
    mocked(blockHeaderModule.hashBlockHeader).mockReset()
  })

  it('attempt batch size times', () => {
    const targetTooBig = Buffer.alloc(8)
    targetTooBig[0] = 10
    mocked(blockHeaderModule.hashBlockHeader).mockReturnValue(targetTooBig)

    const result = mineHeader({
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

    const result = mineHeader({
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

    const result = mineHeader({
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
