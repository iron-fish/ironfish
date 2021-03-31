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
  private failedRetries = 0

  /**
   * Timestamp representing the next time to allow a connection to be initiated.
   */
  private disconnectUntil = 0

  /**
   * Call this if new connection attempts should never be made.
   */
  neverRetryConnecting(): void {
    this.disconnectUntil = Infinity
  }

  /**
   * True if new connection attempts will never be made.
   */
  get willNeverRetryConnecting(): boolean {
    return this.disconnectUntil === Infinity
  }

  /**
   * True if a new connection can be initiated.
   */
  get canConnect(): boolean {
    return Date.now() > this.disconnectUntil
  }

  /**
   * Call this when a successful connection is made to the peer.
   * If neverRetryConnecting is set, clears it.
   */
  successfulConnection(): void {
    this.failedRetries = 0
    this.disconnectUntil = 0
  }

  /**
   * Call this when a connection to a peer fails.
   * @param now The current time
   */
  failedConnection(isWhitelisted = false, now: number = Date.now()): void {
    let disconnectUntil = Infinity

    if (this.failedRetries < retryIntervals.length) {
      disconnectUntil = now + retryIntervals[this.failedRetries]
    } else if (isWhitelisted) {
      disconnectUntil = now + retryIntervals[retryIntervals.length - 1]
    }

    this.disconnectUntil = disconnectUntil
    this.failedRetries++
  }
}
