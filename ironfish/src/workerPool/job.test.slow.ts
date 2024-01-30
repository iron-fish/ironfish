/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { generateKey } from '@ironfish/rust-nodejs'
import { Assert } from '../assert'
import { createNodeTest } from '../testUtilities/nodeTest'
import { Job } from './job'
import { WorkerMessage, WorkerMessageType } from './tasks/workerMessage'

describe('Worker Pool', () => {
  const nodeTest = createNodeTest(false, { config: { nodeWorkers: 1 } })

  it('createMinersFee', async () => {
    const { workerPool, chain } = nodeTest
    workerPool.start()

    expect(workerPool.workers.length).toBe(1)
    expect(workerPool.completed).toBe(0)

    const minersFee = await chain.createMinersFee(BigInt(0), 0, generateKey().spendingKey)
    expect(minersFee.serialize()).toBeInstanceOf(Buffer)

    expect(workerPool.completed).toBe(1)
  })

  it('verifyTransactions', async () => {
    const { workerPool } = nodeTest

    workerPool.start()

    expect(workerPool.workers.length).toBe(1)
    expect(workerPool.completed).toBe(0)

    const genesis = await nodeTest.node.chain.getBlock(nodeTest.node.chain.head.hash)
    Assert.isNotNull(genesis)
    const transaction = genesis.transactions[0]
    const result = await workerPool.verifyTransactions([transaction])

    expect(result.valid).toBe(true)
    expect(workerPool.completed).toBe(1)
  })

  describe('execute', () => {
    it('handles failures sending messages to workers', () => {
      const { workerPool } = nodeTest

      workerPool.start()

      expect(workerPool.workers.length).toBe(1)

      class ErrorWorkerMessage extends WorkerMessage {
        serializePayload(): void {
          throw new Error('Always throw an error during serialization.')
        }

        getSize(): number {
          return 0
        }
      }

      const worker = workerPool.workers[0]
      const message = new ErrorWorkerMessage(WorkerMessageType.JobError)
      const job = new Job(message)

      expect(job.status).toEqual('queued')

      expect(() => job.execute(worker)).toThrow()

      expect(job.status).toEqual('error')
      expect(worker.jobs.size).toEqual(0)
      expect(worker.canTakeJobs).toBe(true)
    })
  })
})
