/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { mockLogger, mockWorkerPool } from '../testUtilities/mocks'
import { Metric } from './interfaces/metric'
import { Telemetry } from './telemetry'

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
describe('Telemetry', () => {
  let telemetry: Telemetry

  const mockMetric: Metric = {
    measurement: 'node',
    name: 'memory',
    fields: [
      {
        name: 'heap_used',
        type: 'integer',
        value: 0,
      },
    ],
  }

  beforeEach(() => {
    telemetry = new Telemetry(mockWorkerPool(), mockLogger(), [])
    telemetry.start()
  })

  afterEach(() => {
    telemetry?.stop()
  })

  describe('stop', () => {
    it('sends a message for the node to stop and flushes remaining points', async () => {
      const flush = jest.spyOn(telemetry, 'flush')
      const submitNodeStopped = jest.spyOn(telemetry, 'submitNodeStopped')
      await telemetry.stop()
      expect(flush).toHaveBeenCalledTimes(1)
      expect(submitNodeStopped).toHaveBeenCalledTimes(1)
    })
  })

  describe('submit', () => {
    describe('when disabled', () => {
      it('does nothing', () => {
        const disabledTelemetry = new Telemetry(mockWorkerPool(), mockLogger(), [])
        const currentPoints = disabledTelemetry['points']
        disabledTelemetry.submit(mockMetric)
        expect(disabledTelemetry['points']).toEqual(currentPoints)
      })
    })

    describe('when submitting a metric without fields', () => {
      it('throws an error', () => {
        const metric: Metric = {
          measurement: 'node',
          name: 'memory',
          fields: [],
        }

        expect(() => telemetry.submit(metric)).toThrowError()
      })
    })

    it('stores the metric', () => {
      const currentPointsLength = telemetry['points'].length
      telemetry.submit(mockMetric)

      const points = telemetry['points']
      expect(points).toHaveLength(currentPointsLength + 1)
      expect(points[points.length - 1]).toMatchObject(mockMetric)
    })
  })

  describe('flush', () => {
    describe('when the pool throws an error and the queue is not saturated', () => {
      it('retries the points and logs an error', async () => {
        jest.spyOn(telemetry['pool'], 'submitTelemetry').mockImplementationOnce(() => {
          throw new Error()
        })
        const error = jest.spyOn(telemetry['logger'], 'error')

        const points = []
        for (let i = 0; i < telemetry['MAX_QUEUE_SIZE'] - 1; i++) {
          points.push(mockMetric)
        }
        telemetry['points'] = points

        await telemetry.flush()
        expect(telemetry['points']).toEqual(points)
        expect(error).toHaveBeenCalled()
      })
    })

    it('submits telemetry to the pool', async () => {
      const submitTelemetry = jest.spyOn(telemetry['pool'], 'submitTelemetry')
      telemetry.submit(mockMetric)
      await telemetry.flush()

      expect(submitTelemetry).toHaveBeenCalled()
    })
  })
})
