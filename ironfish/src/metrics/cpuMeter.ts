/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import os from 'os'
import { HRTime, SetIntervalToken } from '../utils'
import { RollingAverage } from './rollingAverage'

/**
 * Calculates an exponentially weighted moving average and rolling average
 * for CPU usage percentage. This keeps track of the % of overall OS CPU the
 * current process is using. Overall OS CPU is calculated with the sum of total CPU time
 * across ALL cores of the machine
 */
export class CPUMeter {
  private _average: RollingAverage
  private _current = 0
  private _intervalMs: number
  private _started = false
  private _interval: SetIntervalToken | null = null
  private _lastReading: {
    time: HRTime
    osCpu: os.CpuInfo[]
    processCpu: NodeJS.CpuUsage
  } | null = null

  constructor(refreshInterval: number) {
    this._intervalMs = refreshInterval
    this._average = new RollingAverage(60)
  }

  get current(): number {
    return this._current
  }

  get rollingAverage(): number {
    return this._average.average
  }

  start(): void {
    if (this._started) {
      return
    }
    this._started = true
    this._interval = setInterval(() => this.recordCPUDataPoint(), this._intervalMs)
  }

  stop(): void {
    if (!this._started) {
      return
    }
    this._started = false
    this._lastReading = null

    if (this._interval) {
      clearInterval(this._interval)
    }
  }

  reset(): void {
    this._average.reset()
    this._lastReading = null
  }

  private recordCPUDataPoint(): void {
    const now = process.hrtime()
    const osCpu = os.cpus()
    const processCpu = process.cpuUsage()
    const cpuCores = os.cpus().length

    if (this._lastReading === null) {
      this._lastReading = { time: now, osCpu, processCpu }
      return
    }

    const elapsedCpuTime = this.totalCpuTime(osCpu) - this.totalCpuTime(this._lastReading.osCpu)
    const elapsedProcessUserTime = processCpu.user - this._lastReading.processCpu.user
    const elapsedProcessSysTime = processCpu.system - this._lastReading.processCpu.system

    // process time is in nanoseconds, os time is in milliseconds
    const percProcessCpu =
      ((elapsedProcessUserTime + elapsedProcessSysTime) / 1000 / elapsedCpuTime) *
      100 *
      cpuCores

    this._average.add(percProcessCpu)
    this._current = percProcessCpu

    this._lastReading = { time: now, osCpu, processCpu }
  }

  private totalCpuTime(measure: os.CpuInfo[]) {
    let total = 0
    for (const cpuInfo of measure) {
      total +=
        cpuInfo.times.idle +
        cpuInfo.times.irq +
        cpuInfo.times.nice +
        cpuInfo.times.sys +
        cpuInfo.times.user
    }
    return total
  }
}
