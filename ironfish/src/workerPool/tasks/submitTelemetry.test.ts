/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Metric } from '../../telemetry'
import { GraffitiUtils } from '../../utils/graffiti'
import { WebApi } from '../../webApi'
import {
  SubmitTelemetryRequest,
  SubmitTelemetryResponse,
  SubmitTelemetryTask,
} from './submitTelemetry'

describe('SubmitTelemetryRequest', () => {
  it('serializes the object to a buffer and deserializes to the original object', () => {
    const unsafeInteger = 0.2
    expect(Number.isSafeInteger(unsafeInteger)).toBe(false)

    const mockMetric: Metric = {
      measurement: 'node',
      fields: [
        {
          name: 'heap_used',
          type: 'integer',
          value: 0,
        },
        {
          name: 'foo',
          type: 'string',
          value: 'bar',
        },
        {
          name: 'baz',
          type: 'integer',
          value: 10,
        },
        {
          name: 'buz',
          type: 'float',
          value: unsafeInteger,
        },
      ],
      timestamp: new Date(),
    }

    const request = new SubmitTelemetryRequest([mockMetric], GraffitiUtils.fromString(''))
    const buffer = request.serialize()
    const deserializedRequest = SubmitTelemetryRequest.deserialize(request.jobId, buffer)
    expect(deserializedRequest).toEqual(request)
  })
})

describe('SubmitTelemetryResponse', () => {
  it('serializes the object to a buffer and deserializes to the original object', () => {
    const response = new SubmitTelemetryResponse(0)
    const deserializedResponse = SubmitTelemetryResponse.deserialize(response.jobId)
    expect(deserializedResponse).toEqual(response)
  })
})

describe('SubmitTelemetryTask', () => {
  describe('execute', () => {
    it('submits points to the API', async () => {
      const submitTelemetryPointsToApi = jest
        .spyOn(WebApi.prototype, 'submitTelemetry')
        .mockImplementationOnce(jest.fn())
      const mockMetric: Metric = {
        measurement: 'node',
        fields: [
          {
            name: 'heap_used',
            type: 'integer',
            value: 0,
          },
        ],
        timestamp: new Date(),
      }
      const points = [mockMetric]
      const graffitiBuffer = GraffitiUtils.fromString('testgraffiti')
      const graffiti = GraffitiUtils.toHuman(graffitiBuffer)
      const task = new SubmitTelemetryTask()
      const request = new SubmitTelemetryRequest(points, graffitiBuffer)

      await task.execute(request)
      expect(submitTelemetryPointsToApi).toHaveBeenCalledWith({ points, graffiti })
    })
  })
})
