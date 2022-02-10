/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Config } from '../fileStores'
import { Logger } from '../logger'
import { Block } from '../primitives/block'
import { renderError, SetIntervalToken } from '../utils'
import { WorkerPool } from '../workerPool'
import { Metric } from './interfaces/metric'
import { Tag } from './interfaces/tag'

export class Telemetry {
  private readonly FLUSH_INTERVAL = 5000
  private readonly MAX_QUEUE_SIZE = 1000

  private readonly enabled: boolean
  private readonly defaultTags: Tag[]
  private readonly logger: Logger
  private readonly pool: WorkerPool

  private flushInterval: SetIntervalToken | null
  private points: Metric[]

  constructor(config: Config, pool: WorkerPool, logger: Logger, defaultTags: Tag[]) {
    this.enabled = config.get('enableTelemetry')
    this.logger = logger
    this.pool = pool
    this.defaultTags = defaultTags

    this.flushInterval = null
    this.points = []
  }

  start(): void {
    if (this.enabled) {
      this.flushInterval = setInterval(() => void this.flush(), this.FLUSH_INTERVAL)
    }
  }

  async stop(): Promise<void> {
    if (this.enabled) {
      await this.submitNodeStopped()
      await this.flush()
    }

    if (this.flushInterval) {
      clearTimeout(this.flushInterval)
    }
  }

  async submit(metric: Metric): Promise<void> {
    if (!this.enabled) {
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

    if (this.points.length >= this.MAX_QUEUE_SIZE) {
      await this.flush()
    }
  }

  async flush(): Promise<void> {
    const points = this.points
    this.points = []

    try {
      await this.pool.submitTelemetry(points)
      this.logger.debug(`Submitted ${points.length} telemetry points`)
    } catch (error: unknown) {
      this.logger.error(`Error submitting telemetry to API: ${renderError(error)}`)

      if (points.length < this.MAX_QUEUE_SIZE) {
        this.logger.debug('Retrying telemetry submission')
        this.points = points
      }
    }
  }

  async submitNodeStarted(): Promise<void> {
    await this.submit({
      measurement: 'node',
      name: 'started',
      fields: [{ name: 'online', type: 'boolean', value: true }],
    })
  }

  async submitNodeStopped(): Promise<void> {
    await this.submit({
      measurement: 'node',
      name: 'started',
      fields: [{ name: 'online', type: 'boolean', value: false }],
    })
  }

  async submitBlockMined(block: Block): Promise<void> {
    await this.submit({
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

  async submitMemoryUsage(heapUsed: number, heapTotal: number): Promise<void> {
    await this.submit({
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
}
