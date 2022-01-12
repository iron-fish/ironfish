/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { createRootLogger, Logger } from '../logger'
import { Gauge } from './gauge'
import { Meter } from './meter'

export class MetricsMonitor {
  private _started = false
  private _meters: Meter[] = []
  readonly logger: Logger

  readonly p2p_InboundTraffic: Meter
  readonly p2p_InboundTraffic_WS: Meter
  readonly p2p_InboundTraffic_WebRTC: Meter

  readonly p2p_OutboundTraffic: Meter
  readonly p2p_OutboundTraffic_WS: Meter
  readonly p2p_OutboundTraffic_WebRTC: Meter

  readonly heapUsed: Gauge
  readonly rss: Gauge
  private memoryInterval: ReturnType<typeof setInterval> | undefined
  private readonly memoryRefreshPeriodMs = 1000

  constructor(logger: Logger = createRootLogger()) {
    this.logger = logger

    this.p2p_InboundTraffic = this.addMeter()
    this.p2p_InboundTraffic_WS = this.addMeter()
    this.p2p_InboundTraffic_WebRTC = this.addMeter()

    this.p2p_OutboundTraffic = this.addMeter()
    this.p2p_OutboundTraffic_WS = this.addMeter()
    this.p2p_OutboundTraffic_WebRTC = this.addMeter()

    this.heapUsed = new Gauge()
    this.rss = new Gauge()
  }

  get started(): boolean {
    return this._started
  }

  start(): void {
    this._started = true
    this._meters.forEach((m) => m.start())

    this.memoryInterval = setInterval(() => this.refreshMemory(), this.memoryRefreshPeriodMs)
  }

  stop(): void {
    this._started = false
    this._meters.forEach((m) => m.stop())

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
    this.heapUsed.set(memoryUsage.heapUsed)
    this.rss.set(memoryUsage.rss)
  }
}
