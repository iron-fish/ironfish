/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Interfaces } from '@oclif/core'

export interface ProgressBar {
  progress: () => void
  getTotal(): number
  setTotal(totalValue: number): void
  start(totalValue?: number, startValue?: number, payload?: Record<string, unknown>): void
  stop: () => void
  update(currentValue?: number, payload?: Record<string, unknown>): void
  update(payload?: Record<string, unknown>): void
  increment(delta?: number, payload?: Record<string, unknown>): void
  increment(payload?: Record<string, unknown>): void
}

export type CommandFlags<T> = T extends Interfaces.Input<infer TFlags, infer GFlags>
  ? Interfaces.ParserOutput<TFlags, GFlags>['flags']
  : never
