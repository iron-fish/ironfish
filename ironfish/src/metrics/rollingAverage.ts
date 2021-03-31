/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Utility to efficiently compute the rolling average and variance over a sliding window of samples
 *
 * Taken from https://github.com/BabylonJS/Babylon.js/blob/0f31c20/src/Misc/performanceMonitor.ts#L125
 */
export class RollingAverage {
  /**
   * Current average
   */
  average = 0
  /**
   * Current variance
   */
  variance = 0

  protected _samples: Array<number>
  protected _sampleCount = 0
  protected _pos = 0

  /** sum of squares of differences from the (current) mean */
  protected _m2 = 0

  /**
   * constructor
   * @param length The number of samples required to saturate the sliding window
   */
  constructor(length: number) {
    this._samples = new Array<number>(Math.ceil(Math.max(length, 2)))
    this.reset()
  }

  /**
   * Adds a sample to the sample set
   * @param v The sample value
   */
  add(v: number): void {
    //http://en.wikipedia.org/wiki/Algorithms_for_calculating_variance
    let delta: number

    //we need to check if we've already wrapped round
    if (this.isSaturated()) {
      //remove bottom of stack from mean
      const bottomValue = this._samples[this._pos]
      delta = bottomValue - this.average
      this.average -= delta / (this._sampleCount - 1)
      this._m2 -= delta * (bottomValue - this.average)
    } else {
      this._sampleCount++
    }

    //add new value to mean
    delta = v - this.average
    this.average += delta / this._sampleCount
    this._m2 += delta * (v - this.average)

    //set the new variance
    this.variance = this._m2 / (this._sampleCount - 1)

    this._samples[this._pos] = v
    this._pos++

    this._pos %= this._samples.length //positive wrap around
  }

  /**
   * Returns previously added values or null if outside of history or outside the sliding window domain
   * @param i Index in history. For example, pass 0 for the most recent value and 1 for the value before that
   * @return Value previously recorded with add() or null if outside of range
   */
  history(i: number): number {
    if (i >= this._sampleCount || i >= this._samples.length) {
      return 0
    }

    const i0 = this._wrapPosition(this._pos - 1.0)
    return this._samples[this._wrapPosition(i0 - i)]
  }

  /**
   * Returns true if enough samples have been taken to completely fill the sliding window
   * @return true if sample-set saturated
   */
  isSaturated(): boolean {
    return this._sampleCount >= this._samples.length
  }

  /**
   * Resets the rolling average (equivalent to 0 samples taken so far)
   */
  reset(): void {
    this.average = 0
    this.variance = 0
    this._sampleCount = 0
    this._pos = 0
    this._m2 = 0
  }

  /**
   * Wraps a value around the sample range boundaries
   * @param i Position in sample range, for example if the sample length is 5, and i is -3, then 2 will be returned.
   * @return Wrapped position in sample range
   */
  protected _wrapPosition(i: number): number {
    const max = this._samples.length
    return ((i % max) + max) % max
  }
}
