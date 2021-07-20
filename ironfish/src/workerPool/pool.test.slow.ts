/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { generateKey } from 'ironfish-wasm-nodejs'
import { Strategy } from '../strategy'
import { WorkerPool } from './pool'

describe('Worker Pool', () => {
  beforeAll(() => {
    // Pay the cost of setting up Sapling and the DB outside of any test
    generateKey()
  })

  it('If pool is empty, executes on main thread', async () => {
    // Generate a miner's fee transaction
    const emptyPool = new WorkerPool()
    const strategy = new Strategy(emptyPool)
    const minersFee = await strategy.createMinersFee(BigInt(0), 0, generateKey().spending_key)

    expect(emptyPool['workers'].length).toBe(0)
    const promise = emptyPool.transactionFee(minersFee)
    expect(emptyPool['resolvers'].size).toBe(0)

    const fee = await promise

    expect(emptyPool['resolvers'].size).toBe(0)
    expect(fee).toEqual(BigInt(-500000000))
  }, 60000)

  it('Terminates all workers when stop is called', async () => {
    // Generate a miner's fee transaction to create a resolver
    const pool = new WorkerPool()
    const strategy = new Strategy(pool)
    const minersFee = await strategy.createMinersFee(BigInt(0), 0, generateKey().spending_key)

    pool.start(1)

    expect(pool['workers'].length).toBe(1)
    expect(pool.started).toBe(true)

    const worker = pool['workers'][0]
    const terminateSpy = jest.spyOn(worker.worker, 'terminate')
    void pool.verify(minersFee)
    expect(pool['resolvers'].size).toBeGreaterThan(0)

    await pool.stop()

    expect(terminateSpy).toBeCalled()

    expect(pool['workers'].length).toBe(0)
    expect(pool['resolvers'].size).toBe(0)
    expect(pool.started).toBe(false)
  }, 60000)

  describe('Worker thread operations', () => {
    const workerPool: WorkerPool = new WorkerPool()

    beforeEach(() => {
      workerPool.start(1)
    })

    afterEach(async () => {
      await workerPool.stop()
    })

    it('Resolves promises created by the pool on a worker thread', async () => {
      const strategy = new Strategy(workerPool)
      expect(workerPool['workers'].length).toBeGreaterThan(0)

      const minersFeePromise = strategy.createMinersFee(
        BigInt(0),
        0,
        generateKey().spending_key,
      )
      expect(workerPool['resolvers'].size).toBe(1)

      await minersFeePromise

      expect(workerPool['resolvers'].size).toBe(0)
    }, 60000)

    it('Returns a Transaction with a Buffer', async () => {
      const strategy = new Strategy(workerPool)
      expect(workerPool['workers'].length).toBeGreaterThan(0)

      const minersFee = await strategy.createMinersFee(BigInt(0), 0, generateKey().spending_key)

      expect(minersFee.serialize()).toBeInstanceOf(Buffer)
    }, 60000)
  })
})
