/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../assert'
import { Blockchain } from '../blockchain'
import { Config } from '../fileStores/config'
import { createRootLogger, Logger } from '../logger'
import { MetricsMonitor } from '../metrics'
import { Identity } from '../network'
import { isRpcNetworkMessageType } from '../network/messageRegistry'
import { NetworkMessageType } from '../network/types'
import { BlockHeader, Transaction } from '../primitives'
import { Block } from '../primitives/block'
import { TransactionHash } from '../primitives/transaction'
import { GraffitiUtils, renderError, SetIntervalToken } from '../utils'
import { WorkerPool } from '../workerPool'
import { Field } from './interfaces/field'
import { Metric } from './interfaces/metric'
import { Tag } from './interfaces/tag'

export class Telemetry {
  private readonly FLUSH_INTERVAL = 60 * 60 * 1000 // 60 minutes
  private readonly MAX_POINTS_TO_SUBMIT = 1000
  private readonly MAX_RETRIES = 5
  private readonly METRICS_INTERVAL = 5 * 60 * 1000 // 5 minutes

  private readonly chain: Blockchain
  private readonly config: Config
  private readonly defaultTags: Tag[]
  private readonly defaultFields: Field[]
  private readonly logger: Logger
  private readonly metrics: MetricsMonitor | null
  private readonly workerPool: WorkerPool
  private readonly localPeerIdentity: Identity
  private readonly apiUrl: string

  private started: boolean
  private flushInterval: SetIntervalToken | null
  private metricsInterval: SetIntervalToken | null
  private points: Metric[]
  private retries: number
  private _submitted: number

  constructor(options: {
    chain: Blockchain
    workerPool: WorkerPool
    config: Config
    logger?: Logger
    metrics?: MetricsMonitor
    localPeerIdentity: Identity
    defaultFields?: Field[]
    defaultTags?: Tag[]
    networkId: number
  }) {
    this.chain = options.chain
    this.workerPool = options.workerPool
    this.config = options.config
    this.logger = options.logger ?? createRootLogger()
    this.metrics = options.metrics ?? null
    this.defaultTags = options.defaultTags ?? []
    this.defaultTags.push({ name: 'networkId', value: options.networkId.toString() })
    this.defaultFields = options.defaultFields ?? []
    this.localPeerIdentity = options.localPeerIdentity

    this.flushInterval = null
    this.metricsInterval = null
    this.points = []
    this.retries = 0
    this._submitted = 0
    this.started = false

    this.apiUrl = this.config.get('telemetryApi')
    if (!this.apiUrl && options.networkId === 0) {
      this.apiUrl = 'https://testnet.api.ironfish.network'
    } else if (!this.apiUrl) {
      this.apiUrl = 'https://api.ironfish.network'
    }
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
      this.metricsInterval = setTimeout(() => {
        void this.metricsLoop()
      }, this.METRICS_INTERVAL)
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

    for (const [id, meter] of this.metrics.p2p_OutboundMessagesByPeer) {
      this.submit({
        measurement: 'peer_messages',
        timestamp: new Date(),
        fields: [
          {
            name: 'source',
            type: 'string',
            value: this.localPeerIdentity,
          },
          {
            name: 'target',
            type: 'string',
            value: id,
          },
          {
            name: 'amount',
            type: 'float',
            value: meter.rate5m,
          },
        ],
      })
    }

    const fields: Field[] = [
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
        name: 'rss',
        type: 'integer',
        value: this.metrics.rss.value,
      },
      {
        name: 'inbound_traffic',
        type: 'float',
        value: this.metrics.p2p_InboundTraffic.rate5m,
      },
      {
        name: 'outbound_traffic',
        type: 'float',
        value: this.metrics.p2p_OutboundTraffic.rate5m,
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
        name: 'mempool_size_bytes',
        type: 'integer',
        value: Math.round(this.metrics.memPoolSizeBytes.value),
      },
      {
        name: 'mempool_max_size_bytes',
        type: 'integer',
        value: Math.round(this.metrics.memPoolMaxSizeBytes.value),
      },
      {
        name: 'mempool_saturation',
        type: 'integer',
        value: Math.round(this.metrics.memPoolSaturation.value * 100),
      },
      {
        name: 'mempool_evictions',
        type: 'integer',
        value: this.metrics.memPoolEvictions.value,
      },
      {
        name: 'mempool_recently_evicted_cache_size',
        type: 'integer',
        value: this.metrics.memPool_RecentlyEvictedCache_Size.value,
      },
      {
        name: 'mempool_recently_evicted_cache_max_size',
        type: 'integer',
        value: this.metrics.memPool_RecentlyEvictedCache_MaxSize.value,
      },
      {
        name: 'mempool_recently_evicted_cache_saturation',
        type: 'integer',
        value: this.metrics.memPool_RecentlyEvictedCache_Saturation.value,
      },
      {
        name: 'head_sequence',
        type: 'integer',
        value: this.chain.head.sequence,
      },
    ]

    for (const [messageType, meter] of this.metrics.p2p_InboundTrafficByMessage) {
      fields.push({
        name: 'inbound_traffic_' + NetworkMessageType[messageType].toLowerCase(),
        type: 'float',
        value: meter.rate5m,
      })
    }

    for (const [messageType, meter] of this.metrics.p2p_OutboundTrafficByMessage) {
      fields.push({
        name: 'outbound_traffic_' + NetworkMessageType[messageType].toLowerCase(),
        type: 'float',
        value: meter.rate5m,
      })
    }

    for (const [messageType, meter] of this.metrics.p2p_RpcResponseTimeMsByMessage) {
      if (isRpcNetworkMessageType(messageType) && meter._average.sampleCount() >= 10) {
        fields.push({
          name: 'rpc_response_ms_' + NetworkMessageType[messageType].toLowerCase(),
          type: 'float',
          value: meter.avg,
        })
      }
    }

    for (const [messageType, meter] of this.metrics.p2p_RpcSuccessRateByMessage) {
      if (isRpcNetworkMessageType(messageType) && meter._average.sampleCount() >= 10) {
        fields.push({
          name: 'rpc_success_' + NetworkMessageType[messageType].toLowerCase(),
          type: 'float',
          value: meter.avg,
        })
      }
    }

    if (this.metrics.mining_newBlockTemplate._average.sampleCount() >= 10) {
      fields.push({
        name: 'create_new_block_template_duration',
        type: 'float',
        value: this.metrics.mining_newBlockTemplate.avg,
      })
    }

    this.submit({
      measurement: 'node_stats',
      timestamp: new Date(),
      tags: [
        {
          name: 'synced',
          value: this.chain.synced.toString(),
        },
      ],
      fields,
    })

    this.metricsInterval = setTimeout(() => {
      void this.metricsLoop()
    }, this.METRICS_INTERVAL)
  }

  submit(metric: Metric): void {
    if (!this.started) {
      return
    }

    let tags = this.defaultTags
    if (metric.tags) {
      tags = tags.concat(metric.tags)
    }

    const fields = this.defaultFields.concat(metric.fields)

    if (fields.length === 0) {
      throw new Error('Cannot submit metrics without fields')
    }

    // TODO(jason): RollingAverage can produce a negative number which seems
    // like it should be a bug. Investigate then delete this TODO. Negative
    // floats are not allowed by telemetry and produce a 422 error.
    for (const field of fields) {
      if (field.type === 'float') {
        field.value = Math.max(0, field.value)
      }
    }

    this.points.push({
      ...metric,
      timestamp: metric.timestamp,
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
      const graffiti = GraffitiUtils.fromString(this.config.get('blockGraffiti'))
      await this.workerPool.submitTelemetry(points, graffiti, this.apiUrl)
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
    let fields: Field[] = [{ name: 'online', type: 'boolean', value: true }]

    if (this.metrics) {
      fields = fields.concat([
        { name: 'cpu_cores', type: 'integer', value: this.metrics.cpuCores },
        { name: 'memory_total', type: 'integer', value: this.metrics.memTotal },
      ])
    }

    this.submit({
      measurement: 'node_started',
      fields,
      timestamp: new Date(),
    })
  }

  submitNodeStopped(): void {
    this.submit({
      measurement: 'node_started',
      fields: [{ name: 'online', type: 'boolean', value: false }],
      timestamp: new Date(),
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
      timestamp: new Date(),
    })
  }

  submitNewBlockSeen(block: Block, seenAt: Date, peerId: Identity | null): void {
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
          name: 'firstSeenBy',
          type: 'string',
          value: peerId ?? '',
        },
        {
          name: 'sequence',
          type: 'integer',
          value: block.header.sequence,
        },
      ],
    })
  }

  submitCompactBlockAssembled(
    header: BlockHeader,
    missingTransactionCount: number,
    foundTransactionCount: number,
  ): void {
    const totalTransactions = missingTransactionCount + foundTransactionCount
    const foundPercent = totalTransactions !== 0 ? foundTransactionCount / totalTransactions : 1

    this.submit({
      measurement: 'block_assembled',
      timestamp: new Date(),
      tags: [
        {
          name: 'hash',
          value: header.hash.toString('hex'),
        },
      ],
      fields: [
        {
          name: 'missing_transactions',
          type: 'integer',
          value: missingTransactionCount,
        },
        {
          name: 'found_transactions',
          type: 'integer',
          value: foundTransactionCount,
        },
        {
          name: 'found_percent',
          type: 'float',
          value: foundPercent,
        },
      ],
    })
  }

  submitNewTransactionSeen(transaction: Transaction, seenAt: Date): void {
    const hash = transaction.hash()

    if (!this.shouldSubmitTransaction(hash)) {
      return
    }

    this.submit({
      measurement: 'transaction_propagation',
      timestamp: seenAt,
      tags: [
        {
          name: 'hash',
          value: hash.toString('hex'),
        },
      ],
      fields: [],
    })
  }

  /*
   * We don't want to log all transaction propagation because there are too many
   * In this way we can only log propagation for a percentage of transactions
   */
  private shouldSubmitTransaction(hash: TransactionHash) {
    return hash.readDoubleBE() % 10000 === 0
  }
}
