/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Event } from '../../event'
import { Meter } from '../../metrics'
import { BlockHeader } from '../../primitives'
import { PromiseResolve, PromiseUtils } from '../../utils'
import { HeadValue } from '../walletdb/headValue'

export class ScanState {
  hash: Buffer | null = null
  sequence: number | null = null

  readonly start: HeadValue
  readonly end: HeadValue
  readonly startedAt: number
  readonly abortController: AbortController
  readonly onTransaction = new Event<
    [sequence: number, endSequence: number, action: 'connect' | 'disconnect']
  >()
  readonly speed = new Meter()

  private runningPromise: Promise<void>
  private runningResolve: PromiseResolve<void>

  constructor(start: HeadValue, end: HeadValue) {
    const [promise, resolve] = PromiseUtils.split<void>()
    this.runningPromise = promise
    this.runningResolve = resolve

    this.abortController = new AbortController()
    this.startedAt = Date.now()
    this.start = start
    this.end = end
    this.speed.start()
  }

  get isAborted(): boolean {
    return this.abortController.signal.aborted
  }

  get estimate(): number {
    const remaining = this.end.sequence - this.start.sequence
    return (remaining / this.speed.rate1m) * 1000
  }

  signal(header: BlockHeader, action: 'connect' | 'disconnect'): void {
    this.hash = header.hash
    this.sequence = header.sequence
    this.speed.add(1)
    this.onTransaction.emit(header.sequence, this.end.sequence, action)
  }

  signalComplete(): void {
    this.speed.stop()
    this.runningResolve()
  }

  async abort(): Promise<void> {
    this.abortController.abort()
    return this.wait()
  }

  wait(): Promise<void> {
    return this.runningPromise
  }
}
