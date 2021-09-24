/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Event } from '../event'
import { createRootLogger, Logger } from '../logger'
import { WorkerPool } from '../workerPool'
import { Job } from '../workerPool/job'

const FAILURE_RETRY_TIME_MS = 1000

export class Miner {
  status: 'idle' | 'stopped' = 'stopped'
  workers: WorkerPool
  jobs: Job[] = []
  maxWorkers: number
  onRequestWork = new Event<[]>()
  logger: Logger

  constructor(options?: { workers?: number; logger?: Logger }) {
    this.maxWorkers = options?.workers ?? 1
    this.workers = new WorkerPool({ maxWorkers: this.maxWorkers })
    this.logger = options?.logger ?? createRootLogger()
  }

  mine(): void {
    if (this.status === 'stopped') {
      return
    }
  }

  start(): void {
    if (this.status !== 'stopped') {
      return
    }

    this.status = 'idle'
    void this.requestWork()
  }

  private async requestWork(): Promise<void> {
    if (this.status !== 'idle') {
      return
    }

    try {
      await this.onRequestWork.emitAsync()
    } catch {
      setTimeout(() => {
        void this.requestWork()
      }, FAILURE_RETRY_TIME_MS)
    }
  }
}
