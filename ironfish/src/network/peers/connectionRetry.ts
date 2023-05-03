/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const seconds = 1000
const minutes = 60 * seconds

const retryIntervals = [
  7 * seconds,
  15 * seconds,
  30 * seconds,
  1 * minutes,
  3 * minutes,
  5 * minutes,
]

export class ConnectionRetry {
  /**
   * Number of consecutive connection failures.
   */
  private _failedRetries = 0

  /**
   * Timestamp representing the next time to allow a connection to be initiated.
   */
  private _disconnectUntil = 0

  /**
   * If true, a failed connection will not cause ConnectionRetry to stop retrying.
   */
  private _shouldNeverExpire = false

  constructor(shouldNeverExpire = false) {
    this._shouldNeverExpire = shouldNeverExpire
  }

  /**
   * Call this if new connection attempts should never be made.
   */
  neverRetryConnecting(): void {
    this._disconnectUntil = Infinity
  }

  /**
   * True if new connection attempts will never be made.
   */
  get willNeverRetryConnecting(): boolean {
    return this._disconnectUntil === Infinity
  }

  get disconnectUntil(): number {
    return this._disconnectUntil
  }

  get failedRetries(): number {
    return this._failedRetries
  }

  /**
   * True if a new connection can be initiated.
   */
  get canConnect(): boolean {
    return Date.now() > this._disconnectUntil
  }

  /**
   * Call this when a successful connection is made to the peer.
   * If neverRetryConnecting is set, clears it.
   */
  successfulConnection(): void {
    this._failedRetries = 0
    this._disconnectUntil = 0
  }

  /**
   * Call this when a connection to a peer fails.
   * @param now The current time
   */
  failedConnection(now: number = Date.now()): void {
    let disconnectUntil = Infinity

    if (this._failedRetries < retryIntervals.length) {
      disconnectUntil = now + retryIntervals[this._failedRetries]
    } else if (this._shouldNeverExpire) {
      disconnectUntil = now + retryIntervals[retryIntervals.length - 1]
    }

    this._disconnectUntil = disconnectUntil
    this._failedRetries++
  }
}
