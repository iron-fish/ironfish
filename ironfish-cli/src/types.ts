/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export interface ProgressBar {
  progress: VoidFunction
  getTotal(): number
  setTotal(totalValue: number): void
  start(totalValue?: number, startValue?: number, payload?: Record<string, unknown>): void
  stop: VoidFunction
  update(currentValue?: number, payload?: Record<string, unknown>): void
  update(payload?: Record<string, unknown>): void
  increment(delta?: number, payload?: Record<string, unknown>): void
  increment(payload?: Record<string, unknown>): void
}
