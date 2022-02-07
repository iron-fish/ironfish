/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Metric } from './interfaces/metric'
import { Telemetry } from './telemetry'

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
describe('Telemetry', () => {
  let telemetry: Telemetry

  const mockTelemetry = (enabled = true): Telemetry => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const mockConfig: any = {
      get: jest.fn().mockResolvedValueOnce(enabled),
    }
    const mockPool: any = {
      submitTelemetry: jest.fn(),
    }
    const mockLogger: any = {
      debug: jest.fn(),
      error: jest.fn(),
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return new Telemetry(mockConfig, mockPool, mockLogger, [])
  }

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
    telemetry = mockTelemetry()
  })

  describe('submit', () => {
    describe('when disabled', () => {
      it('does nothing', async () => {
        const disabledTelemetry = mockTelemetry(false)
        const currentPoints = disabledTelemetry['points']
        await disabledTelemetry.submit(mockMetric)
        expect(disabledTelemetry['points']).toEqual(currentPoints)
      })
    })

    describe('when submitting a metric without fields', () => {
      it('throws an error', async () => {
        const metric: Metric = {
          measurement: 'node',
          name: 'memory',
          fields: [],
        }
        await expect(telemetry.submit(metric)).rejects.toThrowError()
      })
    })

    describe('when the queue max size has been reached', () => {
      it('flushes the queue', async () => {
        const flush = jest.spyOn(telemetry, 'flush')
        const points = []
        for (let i = 0; i < telemetry['MAX_QUEUE_SIZE']; i++) {
          points.push(mockMetric)
        }
        telemetry['points'] = points

        await telemetry.submit(mockMetric)
        expect(flush).toHaveBeenCalled()
      })
    })

    it('stores the metric', async () => {
      const currentPointsLength = telemetry['points'].length
      await telemetry.submit(mockMetric)

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
      await telemetry.submit(mockMetric)
      await telemetry.flush()

      expect(submitTelemetry).toHaveBeenCalled()
    })
  })
})
