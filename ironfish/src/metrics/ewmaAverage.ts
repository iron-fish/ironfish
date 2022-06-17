/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Assert } from '../assert'

/**
 * Utility to compute the exponential weighted moving average
 *
 * inspired by https://github.com/shaka-project/shaka-player/blob/main/lib/abr/ewma.js
 */
export class EwmaAverage {
  /**
   * Current average
   */
  average = 0

  // larger values of alpha expire historical data more slowly
  private _alpha = 0
  private _estimate = 0
  private _totalWeight = 0

  constructor(halflife: number) {
    Assert.isGreaterThan(halflife, 0)
    this._alpha = Math.exp(Math.log(0.5) / halflife)
    this.reset()
  }

  /**
   * Add a sample {value}, {weight}
   * weight = time delta
   */
  add(value: number, weight: number): void {
    const adjAlpha = Math.pow(this._alpha, weight)
    const newEstimate = value * (1 - adjAlpha) + adjAlpha * this._estimate

    if (!isNaN(newEstimate)) {
      this._estimate = newEstimate
      this._totalWeight += weight
    }

    // compute average
    const zeroFactor = 1 - Math.pow(this._alpha, this._totalWeight)
    this.average = this._estimate / zeroFactor
  }

  /**
   * Resets the rolling average (equivalent to 0 samples taken so far)
   */
  reset(): void {
    this._estimate = 0
    this._totalWeight = 0
  }
}
