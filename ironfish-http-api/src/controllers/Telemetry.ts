/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { InfluxDB, Point } from '@influxdata/influxdb-client'
import { Request, Response } from 'express'
import { Logger } from '../utils/logger'

// Requires three environment variables to be set:
// INFLUX_DB_TOKEN, INFLUX_DB_ORG, and INFLUX_DB_BUCKET
// See example.env for an example.

const influxClient = new InfluxDB({
  url: 'http://localhost:8086',
  token: process.env.INFLUX_DB_TOKEN,
})

async function writeTelemetryController(
  metrics: Components.Schemas.WriteTelemetryRequest,
): Promise<void> {
  Logger.debug('Received Metrics: ', metrics)

  const points = metrics.map((metric) => {
    let point = new Point(metric.name)

    const timestamp = new Date(metric.timestamp)
    point.timestamp(timestamp)

    if (metric.tags) {
      for (const [key, value] of Object.entries(metric.tags)) {
        point = point.tag(key, value)
      }
    }

    for (const field of metric.fields) {
      // This is clumsy because openapi doesn't permit overloading types
      if (field.string !== undefined) {
        point = point.stringField(field.name, field.string)
      } else if (field.integer !== undefined) {
        point = point.intField(field.name, field.integer)
      } else if (field.float !== undefined) {
        point = point.floatField(field.name, field.float)
      } else if (field.boolean !== undefined) {
        point = point.booleanField(field.name, field.boolean)
      }
    }

    return point
  })

  const influxWriter = influxClient.getWriteApi(
    process.env.INFLUX_DB_ORG || '',
    process.env.INFLUX_DB_BUCKET || '',
  )
  influxWriter.writePoints(points)

  return Promise.resolve()
}

export async function writeTelemetry(request: Request, response: Response): Promise<Response> {
  const body = (request.body as unknown) as Components.Schemas.WriteTelemetryRequest
  await writeTelemetryController(body)
  response.sendStatus(200)
  return response
}
