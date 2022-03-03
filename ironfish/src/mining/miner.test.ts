/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import * as nativeModule from '@iron-fish/rust-nodejs'
import { mocked } from 'ts-jest/utils'
import { mineHeader } from './mineHeader'
import { Miner, MineRequest } from './miner'

jest.mock('@iron-fish/rust-nodejs', () => ({
  mineHeaderBatch: jest.fn(),
}))
const testBatchSize = 100

/**
 * Make an iterable of blocks suitable for async generation
 *
 * If waitAfter is supplied, it won't return an exhausted stream
 * until that promise completes. This is useful for tests that
 * need to wait for an event to happen before the stream exhausts.
 */
async function* makeAsync(
  array: Array<MineRequest>,
  waitAfter = Promise.resolve(),
): AsyncGenerator<MineRequest, void, void> {
  for (const block of array) {
    yield block
  }

  await waitAfter
}

describe('Miner', () => {
  it('mines', async () => {
    const miner = new Miner(1, testBatchSize)

    const mineHeaderSpy = jest.spyOn(miner.workerPool, 'mineHeader')
    const stopSpy = jest.spyOn(miner.workerPool, 'stop')

    const successfullyMined = jest.fn()

    await miner.mine(
      makeAsync([
        {
          bytes: Buffer.from([]),
          target: '0',
          miningRequestId: 1,
          sequence: 0,
        },
      ]),
      successfullyMined,
    )

    expect(mineHeaderSpy).toBeCalled()
    expect(stopSpy).toBeCalled()
    expect(successfullyMined).not.toBeCalled()
  })

  it('reschedules on new block', async () => {
    const miner = new Miner(1, testBatchSize)

    const mineHeaderSpy = jest.spyOn(miner.workerPool, 'mineHeader')
    const stopSpy = jest.spyOn(miner.workerPool, 'stop')

    const successfullyMined = jest.fn()

    await miner.mine(
      makeAsync([
        {
          bytes: Buffer.from([]),
          target: '0',
          miningRequestId: 2,
          sequence: 0,
        },
        {
          bytes: Buffer.from([]),
          target: '0',
          miningRequestId: 3,
          sequence: 0,
        },
        {
          bytes: Buffer.from([]),
          target: '0',
          miningRequestId: 4,
          sequence: 0,
        },
      ]),
      successfullyMined,
    )

    expect(mineHeaderSpy).toBeCalledTimes(3)
    expect(stopSpy).toBeCalled()
    expect(successfullyMined).not.toBeCalled()
  })

  it('calls successfullyMined', async () => {
    const miner = new Miner(1, testBatchSize)
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
          bytes: Buffer.from([]),
          target: '0',
          miningRequestId: 2,
          sequence: 0,
        },
      ]),
      successfullyMined,
    )
    expect(successfullyMined).toBeCalledTimes(1)
  })
})

describe('mineHeader', () => {
  beforeEach(() => {
    mocked(nativeModule.mineHeaderBatch).mockReset()
  })

  it('calls native mineHeaderBatch', () => {
    mocked(nativeModule.mineHeaderBatch).mockReturnValue({
      randomness: 0,
      foundMatch: false,
    })
    const result = mineHeader({
      headerBytesWithoutRandomness: Buffer.alloc(8),
      initialRandomness: 42,
      targetValue: '0',
      batchSize: 10,
      miningRequestId: 1,
    })

    expect(result).toStrictEqual({ initialRandomness: 42 })
    expect(nativeModule.mineHeaderBatch).toBeCalledTimes(1)
  })

  it('returns found randomness', () => {
    mocked(nativeModule.mineHeaderBatch).mockReturnValue({
      randomness: 43,
      foundMatch: true,
    })
    const result = mineHeader({
      headerBytesWithoutRandomness: Buffer.alloc(8),
      initialRandomness: 42,
      targetValue: '0',
      batchSize: 10,
      miningRequestId: 1,
    })

    expect(result).toStrictEqual({ initialRandomness: 42, randomness: 43, miningRequestId: 1 })
    expect(nativeModule.mineHeaderBatch).toBeCalledTimes(1)
  })
})
