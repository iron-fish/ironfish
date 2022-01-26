/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * You might think metrics are an io-bound problem, but in order to support batching
 * and retries, we've placed them on a worker thread.
 */

// WARNING: This file only runs on node and will need to be ported
// to webworkers to collect metrics in the browser

import axios, { AxiosError } from 'axios'
import { MessagePort, parentPort, workerData } from 'worker_threads'
import { createRootLogger, Logger } from '../logger'
import { Metric } from '.'

/// 5 seconds between sending batches of metrics
const BATCH_INTERVAL = 5000
/// Send batch early if the queue is large
export const MAX_QUEUE_BEFORE_SUBMIT = 1000
/// Max length of queue before dumping metrics (in event of network outage)
const MAX_QUEUE_BEFORE_DUMP = 10000

type MetricOnWire = Metric & {
  measurement: 'node'
}

let metrics: MetricOnWire[] = []

export function handleMetric(metric: Metric, endpoint: string, logger?: Logger): void {
  metrics.push({
    ...metric,
    measurement: 'node',
  })
  if (metrics.length > MAX_QUEUE_BEFORE_SUBMIT) {
    sendMetrics(endpoint, logger)
  }
}

export function sendMetrics(endpoint: string, logger?: Logger): void {
  if (metrics.length === 0) {
    return
  }

  const toSubmit = metrics
  metrics = []

  axios
    .post(endpoint, { points: toSubmit })
    .then(() => {
      if (logger) {
        logger.debug(`Submitted batch of ${toSubmit.length} metrics`)
      }
    })
    .catch((err: AxiosError) => {
      if (logger) {
        logger.warn('Unable to submit metrics', err.code || '')
      }

      // Put the metrics back on the queue to try again
      // But if metric server is unavailable dump buffer to prevent memory leak
      if (metrics.length < MAX_QUEUE_BEFORE_DUMP) {
        metrics.push(...toSubmit)
      }
    })
}

export function startTelemetryWorker(port: MessagePort): void {
  const logger = createRootLogger().withTag('telemetryWorker')
  const { endpoint } = workerData as unknown as { endpoint: string }
  port.on('message', (metric: Metric) => handleMetric(metric, endpoint, logger))
  setInterval(() => sendMetrics(endpoint, logger), BATCH_INTERVAL)
}

if (parentPort !== null) {
  startTelemetryWorker(parentPort)
}
