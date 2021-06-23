/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import Piscina from 'piscina'
import miner from './miner'

jest.mock('piscina')
// Tell typescript to treat it as a mock
const MockPiscina = (Piscina as unknown) as jest.Mock<Piscina>

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

/**
 * Create a promise that never resolves.
 */
function pending(): Promise<void> {
  return new Promise(() => {})
}

describe('Miner', () => {
  const successfullyMined = jest.fn()
  beforeEach(() => {
    MockPiscina.mockReset()
    successfullyMined.mockReset()
  })
  it('constructs a miner', async () => {
    const mock = {
      runTask: jest.fn(async () => pending()),
      destroy: jest.fn(async () => Promise.resolve()),
    }
    MockPiscina.mockImplementation(() => (mock as unknown) as Piscina)
    await miner(
      makeAsync([
        {
          bytes: { type: 'Buffer', data: [] },
          target: '0',
          miningRequestId: 1,
        },
      ]),
      successfullyMined,
      1,
    )
    expect(MockPiscina).toHaveBeenCalledTimes(1)
    expect(mock.runTask).toHaveBeenCalledTimes(1)
    expect(mock.destroy).toHaveBeenCalledTimes(1)
    expect(successfullyMined).not.toBeCalled()
  })

  it('reschedules on new block', async () => {
    const mock = {
      runTask: jest.fn(async () =>
        Promise.resolve({ randomness: 5, initialRandomness: 10, miningRequestId: 10 }),
      ),
      destroy: jest.fn(async () => Promise.resolve()),
    }
    MockPiscina.mockImplementation(() => (mock as unknown) as Piscina)
    await miner(
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
      1,
    )
    expect(MockPiscina).toHaveBeenCalledTimes(1)
    expect(mock.runTask).toHaveBeenCalledTimes(3)
    expect(mock.destroy).toHaveBeenCalledTimes(1)
    expect(successfullyMined).not.toBeCalled()
  })

  it('calls successfullyMined', async () => {
    jest.spyOn(global.Math, 'floor').mockReturnValue(10)
    const mock = {
      runTask: jest.fn(async () =>
        Promise.resolve({ randomness: 5, initialRandomness: 10, miningRequestId: 10 }),
      ),
      destroy: jest.fn(async () => Promise.resolve()),
    }

    // Used to keep the generator from returning until a block has a chance to mine
    let successfulPromiseCallback: () => void
    const successfulPromise: Promise<void> = new Promise(
      (resolve) => (successfulPromiseCallback = resolve),
    )

    // Exit the generator only after a block has mined
    successfullyMined.mockImplementation(() => successfulPromiseCallback())

    MockPiscina.mockImplementation(() => (mock as unknown) as Piscina)
    await miner(
      makeAsync(
        [
          {
            bytes: { type: 'Buffer', data: [] },
            target: '0',
            miningRequestId: 2,
          },
        ],
        successfulPromise,
      ),
      successfullyMined,
      1,
    )
    expect(successfullyMined).toBeCalledTimes(1)
    expect(MockPiscina).toHaveBeenCalledTimes(1)
    expect(mock.runTask).toHaveBeenCalledTimes(1)
    expect(mock.destroy).toHaveBeenCalledTimes(1)
  })
})
