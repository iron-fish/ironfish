/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Worker } from 'worker_threads'
import DisabledTelemetry from './DisabledTelemetry'
import { Telemetry, Metric } from './index'

/**
 * Telemetry implementation that sends metrics to a node worker thread
 * to be posted.
 */

export default class NodeTelemetry implements Telemetry {
  worker: Worker

  constructor(endpoint: string) {
    this.worker = new Worker(__dirname + '/telemetryBackgroundTask.js', {
      workerData: { endpoint },
    })
  }

  /**
   * Called if the user requests to submit metrics.
   * This is a noop if metrics are already enabled.
   *
   * @returns this and a status message to send to the user
   */
  startCollecting(_endpoint: string): { status: string; next: Telemetry } {
    return { status: 'Telemetry is already enabled', next: this }
  }

  /**
   * Called if the user request to stop recording metrics.
   *
   * Shut down the workers read and returns new DisabledTelemetry
   *
   * @returns new DisabledTelemetry to replace this one and a status message
   * to send to the user
   */
  async stopCollecting(): Promise<{ status: string; next: Telemetry }> {
    await this.worker.terminate()
    return { status: 'Stopped collecting telemetry', next: new DisabledTelemetry() }
  }

  /**
   * Submit the provided metric to the metric server.
   *
   * This returns immediately, but a background task is scheduled.
   */
  submit(metric: Metric): void {
    this.worker.postMessage(metric)
  }

  isEnabled(): boolean {
    return true
  }
}
