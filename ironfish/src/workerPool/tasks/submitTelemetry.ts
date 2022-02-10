/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Metric } from '../../telemetry/interfaces/metric'
import { WebApi } from '../../webApi'

export type SubmitTelemetryRequest = {
  type: 'submitTelemetry'
  points: Metric[]
}

export type SubmitTelemetryResponse = {
  type: 'submitTelemetry'
}

export async function submitTelemetry({
  points,
}: SubmitTelemetryRequest): Promise<SubmitTelemetryResponse> {
  const api = new WebApi()
  await api.submitTelemetry({ points })
  return { type: 'submitTelemetry' }
}
