/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { EnabledTelemetry, Metric, Telemetry } from '.'

/**
 * Implementation of Telemetry interface that discards metrics.
 */

export default class DisabledTelemetry implements Telemetry {
  /**
   * Called if the user requests to stop submitting metrics.
   * Returns a new NodeTelemetry on node; can be adapted for use in browser,
   * but that isn't implemented yet.
   *
   * @returns an enabled telemetry and a status message to display to the user
   */
  startCollecting(endpoint: string): { status: string; next: Telemetry } {
    return { status: 'Collecting telemetry data', next: new EnabledTelemetry(endpoint) }
  }

  /**
   * Called if the user requests to stop submitting metrics.
   * Since disabled telemetry is already not submitting metrics,
   * it is a noop
   *
   * @returns this and a status message to send to the user
   */
  async stopCollecting(): Promise<{ status: string; next: Telemetry }> {
    return Promise.resolve({ status: "Not collecting telemetry; can't stop now", next: this })
  }

  /**
   * Black hole to submit metrics to when telemetry is disabled.
   */
  submit(_metric: Metric): void {
    // discard
  }

  isEnabled(): boolean {
    return false
  }
}
