/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { hashBlockHeader } from '../primitives/blockheader'
import { Target } from '../primitives/target'
import { WorkerPool } from '../workerPool'
import { Job } from '../workerPool/job'

/**
 * The number of tasks to run in each thread batch
 */
const BATCH_SIZE = 10000

/**
 * Return value from a mining task.
 *
 * @param initialRandomness the value that was passed into the task
 * for the initial randomness. Used by the calling code as a task id
 * @param randomness if defined, a value for randomness that was found
 * while mining the task. If undefined, none of the BATCH_SIZE attempts
 * in this task created a valid header
 */
type MineResult = { initialRandomness: number; randomness?: number; miningRequestId?: number }

export default class Miner {
  workerPool: WorkerPool

  constructor(numTasks: number) {
    this.workerPool = new WorkerPool({ maxWorkers: numTasks })
  }

  /**
   * Prime the pool of mining tasks with several jobs for the given block.
   * The main miner will create new jobs one at a time as each of these
   * complete.
   *
   * @param randomness the initial randomness. Each task will try BATCH_SIZE
   * variations on this randomness before returning.
   * @param tasks The list of promises to add the new tasks to
   * @param numTasks The number of new tasks to enqueue
   * @param bytes The bytes of the header to be mined by these tasks
   * @param target The target value that this batch needs to meet
   * @param hashFunction the strategy's hash function, serialized to a string
   */
  private primePool(
    randomness: number,
    tasks: Record<number, PromiseLike<MineResult>>,
    numTasks: number,
    newBlockData: {
      bytes: { type: 'Buffer'; data: number[] }
      target: string
      miningRequestId: number
    },
  ): number {
    const bytes = Buffer.from(newBlockData.bytes.data)

    for (let i = 0; i < numTasks; i++) {
      tasks[randomness] = this.workerPool.mineHeader(
        newBlockData.miningRequestId,
        bytes,
        randomness,
        newBlockData.target,
        BATCH_SIZE,
      )
      randomness += BATCH_SIZE
    }

    return randomness
  }

  /**
   * The miner task.
   *
   * This will probably be started from the RPC layer, which will
   * also need to subscribe to mining director tasks and emit them.
   *
   * @param newBlocksIterator Async iterator of new blocks coming in from
   * the network
   * @param successfullyMined function to call when a block has been successfully
   * mined. The glue code will presumably send this to the mining director
   * over RPC.
   * @param numTasks The number of worker tasks to run in parallel threads.
   */
  async mine(
    newBlocksIterator: AsyncIterator<{
      bytes: { type: 'Buffer'; data: number[] }
      target: string
      miningRequestId: number
    }>,
    successfullyMined: (randomness: number, miningRequestId: number) => void,
  ): Promise<void> {
    let blockToMineResult = await newBlocksIterator.next()
    if (blockToMineResult.done) {
      return
    }
    let blockPromise = newBlocksIterator.next()

    this.workerPool.start()

    let tasks: Record<number, Promise<MineResult>> = {}

    let randomness = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)

    this.primePool(randomness, tasks, this.workerPool.maxWorkers, blockToMineResult.value)

    for (;;) {
      const result = await Promise.race([blockPromise, ...Object.values(tasks)])

      if (isMineResult(result)) {
        delete tasks[result.initialRandomness]

        if (result.randomness !== undefined && result.miningRequestId !== undefined) {
          successfullyMined(result.randomness, result.miningRequestId)
          continue
        }

        tasks[randomness] = this.workerPool.mineHeader(
          blockToMineResult.value.miningRequestId,
          Buffer.from(blockToMineResult.value.bytes.data),
          randomness,
          blockToMineResult.value.target,
          BATCH_SIZE,
        )

        randomness += BATCH_SIZE
      } else {
        tasks = {} // We don't care about the discarded tasks; they will exit soon enough

        blockToMineResult = result

        if (blockToMineResult.done) {
          break
        }

        randomness = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)
        this.primePool(randomness, tasks, this.workerPool.maxWorkers, blockToMineResult.value)

        blockPromise = newBlocksIterator.next()
      }
    }

    await this.workerPool.stop()
  }
}

/**
 * Typeguard to check if an object is a result
 *
 * Used in racing promises against the new incoming block promise
 *
 * @param obj object being checked for type
 */
function isMineResult(obj: unknown): obj is MineResult {
  const asMineResult = obj as MineResult

  if (asMineResult.initialRandomness !== undefined) {
    return true
  }

  return false
}

/**
 * Given header bytes and a target value, attempts to find a randomness
 * value that causes the header hash to meet the target.
 *
 * @param headerBytesWithoutRandomness The bytes to be appended to randomness to generate a header
 * @param miningRequestId An identifier that is passed back to the miner when returning a
 *        successfully mined block
 * @param initialRandomness The first randomness value to attempt. Will try the next
 *        batchSize randomness values after that
 * @param targetValue The target value that a block hash must meet.
 * @param batchSize The number of attempts to mine that should be made in this batch.
 *        Each attempt increments the randomness starting from initialRandomness
 */
export function mineHeader({
  miningRequestId,
  headerBytesWithoutRandomness,
  initialRandomness,
  targetValue,
  batchSize,
  job,
}: {
  miningRequestId: number
  headerBytesWithoutRandomness: Buffer
  initialRandomness: number
  targetValue: string
  batchSize: number
  job?: Job
}): { initialRandomness: number; randomness?: number; miningRequestId?: number } {
  const target = new Target(targetValue)
  const randomnessBytes = new ArrayBuffer(8)

  for (let i = 0; i < batchSize; i++) {
    if (job?.status === 'aborted') {
      break
    }

    // The intention here is to wrap randomness between 0 inclusive and Number.MAX_SAFE_INTEGER inclusive
    const randomness =
      i > Number.MAX_SAFE_INTEGER - initialRandomness
        ? i - (Number.MAX_SAFE_INTEGER - initialRandomness) - 1
        : initialRandomness + i
    new DataView(randomnessBytes).setFloat64(0, randomness, false)

    const headerBytes = Buffer.concat([
      Buffer.from(randomnessBytes),
      headerBytesWithoutRandomness,
    ])

    const blockHash = hashBlockHeader(headerBytes)

    if (Target.meets(new Target(blockHash).asBigInt(), target)) {
      return { initialRandomness, randomness, miningRequestId }
    }
  }
  return { initialRandomness }
}
