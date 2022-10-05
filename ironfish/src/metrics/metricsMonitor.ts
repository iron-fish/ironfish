/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import os from 'os'
import { getHeapStatistics } from 'v8'
import { createRootLogger, Logger } from '../logger'
import { Identity } from '../network'
import { NetworkMessageType } from '../network/types'
import { NumberEnumUtils, SetIntervalToken } from '../utils'
import { CPUMeter } from './cpuMeter'
import { Gauge } from './gauge'
import { Meter } from './meter'

export class MetricsMonitor {
  private _started = false
  private _meters: Meter[] = []
  private readonly logger: Logger

  readonly mining_newBlockTemplate: Meter
  readonly chain_newBlock: Meter
  readonly mining_newBlockTransactions: Meter

  readonly p2p_InboundTraffic: Meter
  readonly p2p_InboundTraffic_WS: Meter
  readonly p2p_InboundTraffic_WebRTC: Meter
  readonly p2p_OutboundTraffic: Meter
  readonly p2p_OutboundTraffic_WS: Meter
  readonly p2p_OutboundTraffic_WebRTC: Meter
  readonly p2p_InboundTrafficByMessage: Map<NetworkMessageType, Meter> = new Map()
  readonly p2p_OutboundTrafficByMessage: Map<NetworkMessageType, Meter> = new Map()
  readonly p2p_RpcSuccessRateByMessage: Map<NetworkMessageType, Meter> = new Map()
  readonly p2p_RpcResponseTimeMsByMessage: Map<NetworkMessageType, Meter> = new Map()
  readonly p2p_PeersCount: Gauge

  // Elements of this map are managed by Peer and PeerNetwork
  p2p_OutboundMessagesByPeer: Map<Identity, Meter> = new Map()

  readonly heapTotal: Gauge
  readonly heapUsed: Gauge
  readonly memPoolSize: Gauge
  readonly rss: Gauge
  readonly memFree: Gauge
  readonly memTotal: number
  readonly heapMax: number

  readonly cpuCores: number

  private memoryInterval: SetIntervalToken | null
  private readonly memoryRefreshPeriodMs = 1000

  readonly cpuMeter = new CPUMeter(500)

  constructor({ logger }: { logger?: Logger }) {
    this.logger = logger ?? createRootLogger()

    this.mining_newBlockTemplate = this.addMeter()
    this.chain_newBlock = this.addMeter()
    this.mining_newBlockTransactions = this.addMeter()

    this.p2p_InboundTraffic = this.addMeter()
    this.p2p_InboundTraffic_WS = this.addMeter()
    this.p2p_InboundTraffic_WebRTC = this.addMeter()
    this.p2p_OutboundTraffic = this.addMeter()
    this.p2p_OutboundTraffic_WS = this.addMeter()
    this.p2p_OutboundTraffic_WebRTC = this.addMeter()

    for (const value of NumberEnumUtils.getNumValues(NetworkMessageType)) {
      this.p2p_InboundTrafficByMessage.set(value, this.addMeter())
      this.p2p_OutboundTrafficByMessage.set(value, this.addMeter())
      // Should only need to add meters for RPC messages, but makes the code a bit
      // cleaner in the current type system to do it this way
      this.p2p_RpcSuccessRateByMessage.set(value, this.addMeter())
      this.p2p_RpcResponseTimeMsByMessage.set(value, this.addMeter())
    }

    this.p2p_PeersCount = new Gauge()

    this.heapTotal = new Gauge()
    this.heapUsed = new Gauge()
    this.rss = new Gauge()
    this.memFree = new Gauge()
    this.memTotal = os.totalmem()
    this.memPoolSize = new Gauge()
    this.memoryInterval = null

    this.heapMax = getHeapStatistics().total_available_size

    this.cpuCores = os.cpus().length
  }

  get started(): boolean {
    return this._started
  }

  start(): void {
    this._started = true
    this._meters.forEach((m) => m.start())
    this.cpuMeter.start()

    this.memoryInterval = setInterval(() => this.refreshMemory(), this.memoryRefreshPeriodMs)
  }

  stop(): void {
    this._started = false
    this._meters.forEach((m) => m.stop())
    this.cpuMeter.stop()

    if (this.memoryInterval) {
      clearTimeout(this.memoryInterval)
    }
  }

  addMeter(): Meter {
    const meter = new Meter()
    this._meters.push(meter)
    if (this._started) {
      meter.start()
    }
    return meter
  }

  private refreshMemory(): void {
    const memoryUsage = process.memoryUsage()
    this.heapTotal.value = memoryUsage.heapTotal
    this.heapUsed.value = memoryUsage.heapUsed
    this.rss.value = memoryUsage.rss
    this.memFree.value = os.freemem()
  }
}
