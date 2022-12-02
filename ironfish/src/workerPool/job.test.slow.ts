/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { generateKey } from '@ironfish/rust-nodejs'
import { createNodeTest } from '../testUtilities/nodeTest'

describe('Worker Pool', () => {
  const nodeTest = createNodeTest(false, { config: { nodeWorkers: 1 } })

  it('createMinersFee', async () => {
    const { workerPool, strategy } = nodeTest
    workerPool.start()

    expect(workerPool.workers.length).toBe(1)
    expect(workerPool.completed).toBe(0)

    const minersFee = await strategy.createMinersFee(BigInt(0), 0, generateKey().spending_key)
    expect(minersFee.serialize()).toBeInstanceOf(Buffer)

    expect(workerPool.completed).toBe(1)
  })
})
