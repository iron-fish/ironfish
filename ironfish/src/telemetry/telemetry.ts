/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createRootLogger, Logger } from '../logger'
import { Block } from '../primitives/block'
import { renderError, SetIntervalToken } from '../utils'
import { WorkerPool } from '../workerPool'
import { Metric } from './interfaces/metric'
import { Tag } from './interfaces/tag'

export class Telemetry {
  private readonly FLUSH_INTERVAL = 5000
  private readonly MAX_POINTS_TO_SUBMIT = 1000
  private readonly MAX_RETRIES = 5

  private readonly defaultTags: Tag[]
  private readonly logger: Logger
  private readonly workerPool: WorkerPool

  private started: boolean
  private flushInterval: SetIntervalToken | null
  private points: Metric[]
  private retries: number

  constructor(options: { workerPool: WorkerPool; logger?: Logger; defaultTags?: Tag[] }) {
    this.logger = options.logger ?? createRootLogger()
    this.workerPool = options.workerPool
    this.defaultTags = options.defaultTags ?? []

    this.flushInterval = null
    this.points = []
    this.retries = 0
    this.started = false
  }

  start(): void {
    if (this.started) {
      return
    }

    this.started = true
    void this.flushLoop()
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return
    }

    this.started = false

    if (this.flushInterval) {
      clearTimeout(this.flushInterval)
    }

    this.submitNodeStopped()
    await this.flush()
  }

  async flushLoop(): Promise<void> {
    await this.flush()

    this.flushInterval = setTimeout(() => {
      void this.flushLoop()
    }, this.FLUSH_INTERVAL)
  }

  submit(metric: Metric): void {
    if (!this.started) {
      return
    }

    if (metric.fields.length === 0) {
      throw new Error('Cannot submit metrics without fields')
    }

    let tags = this.defaultTags
    if (metric.tags) {
      tags = tags.concat(metric.tags)
    }

    this.points.push({
      ...metric,
      timestamp: metric.timestamp || new Date(),
      tags,
    })
  }

  async flush(): Promise<void> {
    const points = this.points.slice(0, this.MAX_POINTS_TO_SUBMIT)
    this.points = this.points.slice(this.MAX_POINTS_TO_SUBMIT)

    if (points.length === 0) {
      return
    }

    try {
      await this.workerPool.submitTelemetry(points)
      this.logger.debug(`Submitted ${points.length} telemetry points`)
      this.retries = 0
    } catch (error: unknown) {
      this.logger.error(`Error submitting telemetry to API: ${renderError(error)}`)

      if (this.retries < this.MAX_RETRIES) {
        this.logger.debug('Retrying telemetry submission')
        this.retries++
        this.points = points.concat(this.points)
      } else {
        this.logger.debug('Max retries reached. Resetting telemetry points')
        this.retries = 0
        this.points = []
      }
    }
  }

  submitNodeStarted(): void {
    this.submit({
      measurement: 'node',
      name: 'started',
      fields: [{ name: 'online', type: 'boolean', value: true }],
    })
  }

  submitNodeStopped(): void {
    this.submit({
      measurement: 'node',
      name: 'started',
      fields: [{ name: 'online', type: 'boolean', value: false }],
    })
  }

  submitBlockMined(block: Block): void {
    this.submit({
      measurement: 'node',
      name: 'block_mined',
      fields: [
        {
          name: 'difficulty',
          type: 'integer',
          value: Number(block.header.target.toDifficulty()),
        },
        {
          name: 'sequence',
          type: 'integer',
          value: Number(block.header.sequence),
        },
      ],
    })
  }

  submitMemoryUsage(heapUsed: number, heapTotal: number): void {
    this.submit({
      measurement: 'node',
      name: 'memory',
      fields: [
        {
          name: 'heap_used',
          type: 'integer',
          value: heapUsed,
        },
        {
          name: 'heap_total',
          type: 'integer',
          value: heapTotal,
        },
      ],
    })
  }

  submitNewBlockSeen(block: Block, seenAt: Date): void {
    this.submit({
      measurement: 'propagation',
      name: 'propagation',
      timestamp: seenAt,
      tags: [
        {
          name: 'block_hash',
          value: block.header.hash.toString('hex'),
        },
      ],
      fields: [
        {
          name: 'block_timestamp',
          type: 'integer',
          value: block.header.timestamp.valueOf(),
        },
        {
          name: 'block_sequence',
          type: 'integer',
          value: block.header.sequence,
        },
      ],
    })
  }
}
