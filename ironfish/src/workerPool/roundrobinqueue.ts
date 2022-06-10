/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Job } from './job'
import { WorkerMessageType } from './tasks/workerMessage'

// Simple queue that will iterate over each type of job sequentially so that each job type
// will be guaranteed not to be backed up by one type queueing many jobs. This does not
// solve the issue of long-running jobs, however. Luckily, this is not something we
// have had to worry about yet.
export class RoundRobinQueue {
  private queueMap: Map<WorkerMessageType, Array<Job>>
  private lastMapIndex = 0

  // Returns the total length of all queues
  get length(): number {
    let length = 0

    for (const queue of this.queueMap.values()) {
      length += queue.length
    }

    return length
  }

  // Instantiates the queue with a map of each key with an empty array value
  constructor() {
    this.queueMap = new Map()

    // Numerical enums return all keys, then all values as strings when
    // trying to enumerate them, so we need to grab only the valid numerical values.
    const enumKeys = Object.keys(WorkerMessageType)
      .map((v) => Number(v))
      .filter((v) => !isNaN(v))

    for (const key of enumKeys) {
      this.queueMap.set(key, [])
    }
  }

  // Executes a function with every job across all queues
  forEach(fn: (j: Job) => void): void {
    for (const queue of this.queueMap.values()) {
      for (const job of queue) {
        fn(job)
      }
    }
  }

  // Add a job to that type's queue
  enqueue(type: WorkerMessageType, job: Job): void {
    const typeQueue = this.queueMap.get(type)

    if (!typeQueue) {
      return
    }

    typeQueue.push(job)
  }

  // Get the next job across all queues. Will iterate over each type
  // starting from the type after the last executed job's type.
  nextJob(): Job | undefined {
    // Increment the key index, wrapping around when reaching the end.
    const nextIndex = (this.lastMapIndex + 1) % this.queueMap.size

    const queueEntries = Array.from(this.queueMap.values())

    // Create a shallow array beginning from the next type
    // after the last executed type, wrapping around to the
    // last executed type.
    const nextInLine = queueEntries.slice(nextIndex).concat(queueEntries.slice(0, nextIndex))

    for (const [index, queue] of nextInLine.entries()) {
      if (!queue.length) {
        continue
      }

      const nextJob = queue.shift()
      if (!nextJob) {
        continue
      }

      this.lastMapIndex = index
      return nextJob
    }
  }

  /**
   * Abort all existing jobs that have been queued, and empty the queues.
   */
  abortAll(): void {
    for (const [type, queue] of this.queueMap.entries()) {
      for (const job of queue) {
        job.abort()
      }

      this.queueMap.set(type, [])
    }
  }
}
