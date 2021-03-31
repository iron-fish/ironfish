/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Meter } from './meter'
import { Logger, createRootLogger } from '../logger'

type Metric = {
  start: () => void
  stop: () => void
}

export class MetricsMonitor {
  private _started = false
  private _metrics: Metric[] = []
  readonly logger: Logger

  readonly p2p_InboundTraffic: Meter
  readonly p2p_InboundTraffic_WS: Meter
  readonly p2p_InboundTraffic_WebRTC: Meter

  readonly p2p_OutboundTraffic: Meter
  readonly p2p_OutboundTraffic_WS: Meter
  readonly p2p_OutboundTraffic_WebRTC: Meter

  constructor(logger: Logger = createRootLogger()) {
    this.logger = logger

    this.p2p_InboundTraffic = this.addMeter()
    this.p2p_InboundTraffic_WS = this.addMeter()
    this.p2p_InboundTraffic_WebRTC = this.addMeter()

    this.p2p_OutboundTraffic = this.addMeter()
    this.p2p_OutboundTraffic_WS = this.addMeter()
    this.p2p_OutboundTraffic_WebRTC = this.addMeter()
  }

  get started(): boolean {
    return this._started
  }

  start(): void {
    this._started = true
    this._metrics.forEach((m) => m.start())
  }

  stop(): void {
    this._started = false
    this._metrics.forEach((m) => m.stop())
  }

  addMeter(): Meter {
    const meter = new Meter()
    this._metrics.push(meter)
    if (this._started) meter.start()
    return meter
  }
}
