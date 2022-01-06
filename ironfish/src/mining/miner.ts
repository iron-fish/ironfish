/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Event } from '../event'
import { Meter } from '../metrics'
import { WorkerPool } from '../workerPool'

export type MineRequest = {
  bytes: Buffer
  target: string
  miningRequestId: number
  sequence: number
}

/**
 * Return value from a mining task.
 *
 * @param initialRandomness the value that was passed into the task
 * for the initial randomness. Used by the calling code as a task id
 * @param randomness if defined, a value for randomness that was found
 * while mining the task. If undefined, none of the BATCH_SIZE attempts
 * in this task created a valid header
 */
export type MineResult = {
  initialRandomness: number
  randomness?: number
  miningRequestId?: number
}

export class Miner {
  readonly workerPool: WorkerPool
  readonly batchSize: number
  readonly hashRate: Meter

  readonly onStartMine = new Event<[request: MineRequest]>()
  readonly onStopMine = new Event<[request: MineRequest]>()

  private tasks: Record<number, Promise<MineResult>> = {}
  private randomness = 0

  constructor(numTasks: number, batchSize = 10000) {
    this.workerPool = new WorkerPool({ numWorkers: numTasks })
    this.batchSize = batchSize
    this.hashRate = new Meter()
  }

  /**
   * Start mining. This will be started from the RPC layer, which will
   * also need to subscribe to mining director tasks and emit them.
   *
   * @param newBlocksIterator Async iterator of new blocks coming in from
   * the network
   * @param successfullyMined function to call when a block has been successfully
   * mined.
   */
  async mine(
    newBlocksIterator: AsyncIterator<MineRequest, void, void>,
    successfullyMined: (request: MineRequest, randomness: number) => void,
  ): Promise<void> {
    const blockToMineResult = await newBlocksIterator.next()

    if (blockToMineResult.done) {
      return
    }

    let blockRequest = blockToMineResult.value
    let blockPromise = newBlocksIterator.next()

    this.workerPool.start()
    this.hashRate.start()
    this.onMineRequest(blockToMineResult.value)

    for (;;) {
      const result = await Promise.race([blockPromise, ...Object.values(this.tasks)])

      if (isMineResult(result)) {
        this.onMineResult(blockRequest, result, successfullyMined)
        continue
      }

      if (result.done) {
        this.onStopMine.emit(blockRequest)
        break
      }

      blockRequest = result.value
      this.onMineRequest(result.value)
      blockPromise = newBlocksIterator.next()
    }

    this.hashRate.stop()
    await this.workerPool.stop()
  }

  onMineRequest(request: MineRequest): void {
    this.onStartMine.emit(request)

    // We don't care about the discarded tasks; they will exit soon enough
    this.tasks = {}

    // Reset our search space
    this.randomness = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)

    for (let i = 0; i < this.workerPool.numWorkers; i++) {
      this.tasks[this.randomness] = this.workerPool.mineHeader(
        request.miningRequestId,
        request.bytes,
        this.randomness,
        request.target,
        this.batchSize,
      )

      this.randomness += this.batchSize
    }
  }

  onMineResult(
    request: MineRequest,
    result: MineResult,
    successfullyMined: (request: MineRequest, randomness: number) => void,
  ): void {
    delete this.tasks[result.initialRandomness]

    this.hashRate.add(
      result.randomness ? result.randomness - result.initialRandomness : this.batchSize,
    )

    // If the worker found a result
    if (result.randomness !== undefined && result.miningRequestId !== undefined) {
      successfullyMined(request, result.randomness)
      return
    }

    // If no result was found, start the next batch of hashes
    const randomness = this.randomness
    this.randomness += this.batchSize

    this.tasks[randomness] = this.workerPool.mineHeader(
      request.miningRequestId,
      request.bytes,
      randomness,
      request.target,
      this.batchSize,
    )
  }
}

function isMineResult(obj: unknown): obj is MineResult {
  return (obj as MineResult).initialRandomness !== undefined
}
