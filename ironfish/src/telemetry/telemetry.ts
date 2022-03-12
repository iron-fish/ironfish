/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../assert'
import { Blockchain } from '../blockchain'
import { createRootLogger, Logger } from '../logger'
import { MetricsMonitor } from '../metrics'
import { Block } from '../primitives/block'
import { renderError, SetIntervalToken } from '../utils'
import { WorkerPool } from '../workerPool'
import { Field } from './interfaces/field'
import { Metric } from './interfaces/metric'
import { Tag } from './interfaces/tag'

export class Telemetry {
  private readonly FLUSH_INTERVAL = 5 * 60 * 1000
  private readonly MAX_POINTS_TO_SUBMIT = 1000
  private readonly MAX_RETRIES = 5
  private readonly METRICS_INTERVAL = 5 * 60 * 1000

  private readonly chain: Blockchain
  private readonly defaultTags: Tag[]
  private readonly defaultFields: Field[]
  private readonly logger: Logger
  private readonly metrics: MetricsMonitor | null
  private readonly workerPool: WorkerPool

  private started: boolean
  private flushInterval: SetIntervalToken | null
  private metricsInterval: SetIntervalToken | null
  private points: Metric[]
  private retries: number
  private _submitted: number

  constructor(options: {
    chain: Blockchain
    workerPool: WorkerPool
    logger?: Logger
    metrics?: MetricsMonitor
    defaultFields?: Field[]
    defaultTags?: Tag[]
  }) {
    this.chain = options.chain
    this.workerPool = options.workerPool
    this.logger = options.logger ?? createRootLogger()
    this.metrics = options.metrics ?? null
    this.defaultTags = options.defaultTags ?? []
    this.defaultFields = options.defaultFields ?? []

    this.flushInterval = null
    this.metricsInterval = null
    this.points = []
    this.retries = 0
    this._submitted = 0
    this.started = false
  }

  get pending(): number {
    return this.points.length
  }

  get submitted(): number {
    return this._submitted
  }

  start(): void {
    if (this.started) {
      return
    }

    this.started = true
    void this.flushLoop()

    if (this.metrics) {
      void this.metricsLoop()
    }
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return
    }

    this.started = false

    if (this.flushInterval) {
      clearTimeout(this.flushInterval)
    }

    if (this.metricsInterval) {
      clearTimeout(this.metricsInterval)
    }

    this.submitNodeStopped()
    await this.flush()
  }

  isStarted(): boolean {
    return this.started
  }

  async flushLoop(): Promise<void> {
    await this.flush()

    this.flushInterval = setTimeout(() => {
      void this.flushLoop()
    }, this.FLUSH_INTERVAL)
  }

  private metricsLoop(): void {
    Assert.isNotNull(this.metrics)

    this.submit({
      measurement: 'node_stats',
      fields: [
        {
          name: 'heap_used',
          type: 'integer',
          value: this.metrics.heapUsed.value,
        },
        {
          name: 'heap_total',
          type: 'integer',
          value: this.metrics.heapTotal.value,
        },
        {
          name: 'inbound_traffic',
          type: 'float',
          value: this.metrics.p2p_InboundTraffic.rate1s,
        },
        {
          name: 'outbound_traffic',
          type: 'float',
          value: this.metrics.p2p_OutboundTraffic.rate1s,
        },
        {
          name: 'peers_count',
          type: 'integer',
          value: this.metrics.p2p_PeersCount.value,
        },
        {
          name: 'mempool_size',
          type: 'integer',
          value: this.metrics.memPoolSize.value,
        },
        {
          name: 'head_sequence',
          type: 'integer',
          value: this.chain.head.sequence,
        },
      ],
    })

    this.metricsInterval = setTimeout(() => {
      void this.metricsLoop()
    }, this.METRICS_INTERVAL)
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

    const fields = this.defaultFields.concat(metric.fields)

    this.points.push({
      ...metric,
      timestamp: metric.timestamp || new Date(),
      tags,
      fields,
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
      this._submitted += points.length
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
      measurement: 'node_started',
      fields: [{ name: 'online', type: 'boolean', value: true }],
    })
  }

  submitNodeStopped(): void {
    this.submit({
      measurement: 'node_started',
      fields: [{ name: 'online', type: 'boolean', value: false }],
    })
  }

  submitBlockMined(block: Block): void {
    this.submit({
      measurement: 'block_mined',
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

  submitNewBlockSeen(block: Block, seenAt: Date): void {
    this.submit({
      measurement: 'block_propagation',
      timestamp: seenAt,
      tags: [
        {
          name: 'hash',
          value: block.header.hash.toString('hex'),
        },
      ],
      fields: [
        {
          name: 'timestamp',
          type: 'integer',
          value: block.header.timestamp.valueOf(),
        },
        {
          name: 'sequence',
          type: 'integer',
          value: block.header.sequence,
        },
      ],
    })
  }
}
