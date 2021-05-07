/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// TODO: This file depends on nodejs librarys (piscina, path) and will not
// work with browser workers. This will need to be abstracted in future.

import Piscina from 'piscina'
import path from 'path'

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
 * Type of the spawned task.
 *
 * Only used to keep typescript happy when constructing the pool
 */
export type MiningTask = (
  headerBytesWithoutRandomness: Buffer,
  initialRandomness: number,
  target: bigint,
  hashFunction: string,
) => number | undefined

/**
 * Add a new job to the pool of mining tasks.
 *
 * Called when a new block has been discovered to be mined,
 * and when an existing batch exits unsuccessfully
 *
 * @param pool The pool of workers
 * @param bytes The bytes of the header to be mined by this task
 * @param randomness The initial randomness value the worker should test
 *        it will increment this value until it finds a match or has
 *        tried all the values in its batch
 * @param target The target value that this batch needs to meet
 * @param hashFunction the strategy's hash function, serialized to a string
 */
function enqueue(
  piscina: Piscina,
  bytes: Buffer,
  miningRequestId: number,
  randomness: number,
  target: string,
): PromiseLike<MineResult> {
  return piscina.runTask({
    miningRequestId,
    headerBytesWithoutRandomness: bytes,
    initialRandomness: randomness,
    targetValue: target,
    batchSize: BATCH_SIZE,
  })
}

/**
 * Prime the pool of mining tasks with several jobs for the given block.
 * The main miner will create new jobs one at a time as each of these
 * complete.
 *
 * @param randomness the inital randomness. Each task will try BATCH_SIZE
 * variations on this randomness before returning.
 * @param pool The pool of workers
 * @param tasks The list of promises to add the new tasks to
 * @param numTasks The number of new tasks to enqueue
 * @param bytes The bytes of the header to be mined by these tasks
 * @param target The target value that this batch needs to meet
 * @param hashFunction the strategy's hash function, serialized to a string
 */
function primePool(
  randomness: number,
  piscina: Piscina,
  tasks: Record<number, PromiseLike<MineResult>>,
  numTasks: number,
  newBlockData: {
    bytes: { type: 'Buffer'; data: number[] }
    target: string
    miningRequestId: number
  },
): number {
  const bytes = Buffer.from(newBlockData.bytes)

  for (let i = 0; i < numTasks; i++) {
    tasks[randomness] = enqueue(
      piscina,
      bytes,
      newBlockData.miningRequestId,
      randomness,
      newBlockData.target,
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
 * @param strategy The strategy that contains the hashBlockHeader function
 * Note that hashBlockHeader must be serializable as a string so that it
 * can be eval'd. Specifically, it must not use any global values
 * from its containing scope, including `this` or any imported modules.
 * @param newBlocksIterator Async iterator of new blocks coming in from
 * the network
 * @param successfullyMined function to call when a block has been successfully
 * mined. The glue code will presumably send this to the mining director
 * over RPC.
 * @param numTasks The number of worker tasks to run in parallel threads.
 */
async function miner(
  newBlocksIterator: AsyncIterator<{
    bytes: { type: 'Buffer'; data: number[] }
    target: string
    miningRequestId: number
  }>,
  successfullyMined: (randomness: number, miningRequestId: number) => void,
  numTasks: number,
): Promise<void> {
  let blockToMineResult = await newBlocksIterator.next()
  if (blockToMineResult.done) return
  let blockPromise = newBlocksIterator.next()

  const piscina = new Piscina({
    filename: path.resolve(__dirname, 'mineHeaderTask.js'),
  })

  let tasks: Record<number, PromiseLike<MineResult>> = {}

  let randomness = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)

  primePool(randomness, piscina, tasks, numTasks, blockToMineResult.value)

  for (;;) {
    const result = await Promise.race([blockPromise, ...Object.values(tasks)])

    if (isMineResult(result)) {
      delete tasks[result.initialRandomness]

      if (result.randomness !== undefined && result.miningRequestId !== undefined) {
        successfullyMined(result.randomness, result.miningRequestId)
        continue
      }

      tasks[randomness] = enqueue(
        piscina,
        Buffer.from(blockToMineResult.value.bytes),
        blockToMineResult.value.miningRequestId,
        randomness,
        blockToMineResult.value.target,
      )

      randomness += BATCH_SIZE
    } else {
      tasks = {} // We don't care about the discarded tasks; they will exit soon enough

      blockToMineResult = result

      if (blockToMineResult.done) {
        break
      }

      randomness = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)
      primePool(randomness, piscina, tasks, numTasks, blockToMineResult.value)

      blockPromise = newBlocksIterator.next()
    }
  }

  await piscina.destroy()
}

export default miner
