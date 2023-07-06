/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { SetIntervalToken } from '../utils'
import { EwmAverage } from './ewmAverage'
import { RollingAverage } from './rollingAverage'

/**
 * A metric type useful for recording metered things like
 *  * blocks per second
 *  * bytes per second
 *
 * This metric will take a sample of how many units were
 * completd each tick cycle and record that in various
 * rolling averages and exponentially weighted moving averages
 *
 * */
export class Meter {
  private _started = false
  private _rate1s: EwmAverage
  private _rate5s: EwmAverage
  private _rate1m: EwmAverage
  private _rate5m: EwmAverage
  _average: RollingAverage
  private _rollingRate1s: RollingAverage
  private _rollingRate5s: RollingAverage
  private _rollingRate1m: RollingAverage
  private _rollingRate5m: RollingAverage
  private _count = 0
  private _interval: SetIntervalToken | null = null
  private _intervalMs: number
  private _intervalLastMs: number | null = null

  constructor(options?: { maxRollingAverageSamples?: number }) {
    this._intervalMs = 1000

    this._rate1s = new EwmAverage(1000 / this._intervalMs)
    this._rate5s = new EwmAverage(5000 / this._intervalMs)
    this._rate1m = new EwmAverage((1 * 60 * 1000) / this._intervalMs)
    this._rate5m = new EwmAverage((5 * 60 * 1000) / this._intervalMs)

    const numSamples = options?.maxRollingAverageSamples ?? 1000

    this._average = new RollingAverage(numSamples)

    this._rollingRate1s = new RollingAverage(1000 / this._intervalMs)
    this._rollingRate5s = new RollingAverage(5000 / this._intervalMs)
    this._rollingRate1m = new RollingAverage((1 * 60 * 1000) / this._intervalMs)
    this._rollingRate5m = new RollingAverage((5 * 60 * 1000) / this._intervalMs)
  }

  get rate1s(): number {
    return this._rate1s.average
  }

  get rate5s(): number {
    return this._rate5s.average
  }

  get rate1m(): number {
    return this._rate1m.average
  }

  get rate5m(): number {
    return this._rate5m.average
  }

  get avg(): number {
    return this._average.average
  }

  get rollingRate1s(): number {
    return this._rollingRate1s.average
  }

  get rollingRate5s(): number {
    return this._rollingRate5s.average
  }

  get rollingRate1m(): number {
    return this._rollingRate1m.average
  }

  get rollingRate5m(): number {
    return this._rollingRate5m.average
  }

  add(count: number): void {
    if (!this._started) {
      return
    }
    this._count += count
    this._average.add(count)
  }

  start(): void {
    if (this._started) {
      return
    }
    this._started = true
    this._interval = setInterval(() => this.update(), this._intervalMs)
  }

  stop(): void {
    if (!this._started) {
      return
    }
    this._started = false
    this._intervalLastMs = null
    this._count = 0

    if (this._interval) {
      clearInterval(this._interval)
    }
  }

  reset(): void {
    this._rate1s.reset()
    this._rate5s.reset()
    this._rate1m.reset()
    this._rate5m.reset()
    this._average.reset()
    this._rollingRate1s.reset()
    this._rollingRate5s.reset()
    this._rollingRate1m.reset()
    this._rollingRate5m.reset()
    this._count = 0
    this._intervalLastMs = null
  }

  private update(): void {
    const now = performance.now()

    if (this._intervalLastMs === null) {
      this._intervalLastMs = now
      return
    }

    const elapsedMs = now - this._intervalLastMs
    const rateSec = elapsedMs === 0 ? 0 : (this._count / elapsedMs) * 1000
    const weight = elapsedMs / this._intervalMs

    this._rate1s.add(rateSec, weight)
    this._rate5s.add(rateSec, weight)
    this._rate1m.add(rateSec, weight)
    this._rate5m.add(rateSec, weight)

    this._rollingRate1s.add(rateSec)
    this._rollingRate5s.add(rateSec)
    this._rollingRate1m.add(rateSec)
    this._rollingRate5m.add(rateSec)

    this._count = 0
    this._intervalLastMs = now
  }
}
