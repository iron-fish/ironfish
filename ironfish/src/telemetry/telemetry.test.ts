/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { v4 as uuid } from 'uuid'
import { mockChain, mockConfig, mockWorkerPool } from '../testUtilities/mocks'
import { GraffitiUtils } from '../utils/graffiti'
import { Metric } from './interfaces/metric'
import { Telemetry } from './telemetry'

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
describe('Telemetry', () => {
  let telemetry: Telemetry

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
  const mockGraffiti = 'testgraffiti'

  beforeEach(() => {
    telemetry = new Telemetry({
      networkId: 2,
      chain: mockChain(),
      workerPool: mockWorkerPool(),
      config: mockConfig({ blockGraffiti: mockGraffiti }),
      localPeerIdentity: uuid(),
    })

    telemetry.start()
  })

  afterEach(async () => {
    await telemetry?.stop()
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
        const disabledTelemetry = new Telemetry({
          networkId: 2,
          chain: mockChain(),
          workerPool: mockWorkerPool(),
          config: mockConfig({ blockGraffiti: mockGraffiti }),
          localPeerIdentity: uuid(),
        })
        const currentPoints = disabledTelemetry['points']
        disabledTelemetry.submit(mockMetric)
        expect(disabledTelemetry['points']).toEqual(currentPoints)
      })
    })

    describe('when submitting a metric without fields', () => {
      it('throws an error', () => {
        const metric: Metric = {
          measurement: 'node',
          fields: [],
          timestamp: new Date(),
        }

        expect(() => telemetry.submit(metric)).toThrow()
      })
    })

    it('stores the metric', () => {
      const currentPointsLength = telemetry['points'].length
      telemetry.submit(mockMetric)

      const points = telemetry['points']
      expect(points).toHaveLength(currentPointsLength + 1)
      expect(points[points.length - 1]).toMatchObject(
        mockMetric as unknown as Record<string, unknown>,
      )
    })
  })

  describe('flush', () => {
    describe('when the pool throws an error', () => {
      describe('when max retries have not been hit', () => {
        it('retries the points and logs an error', async () => {
          jest.spyOn(telemetry['workerPool'], 'submitTelemetry').mockImplementationOnce(() => {
            throw new Error()
          })
          const error = jest.spyOn(telemetry['logger'], 'error')

          const points = [mockMetric]
          const retries = telemetry['retries']
          telemetry['points'] = points

          await telemetry.flush()
          expect(error).toHaveBeenCalled()
          expect(telemetry['points']).toEqual(points)
          expect(telemetry['retries']).toBe(retries + 1)
        })
      })

      describe('when max retries have been hit', () => {
        it('clears the points and logs an error', async () => {
          jest.spyOn(telemetry['workerPool'], 'submitTelemetry').mockImplementationOnce(() => {
            throw new Error()
          })
          const error = jest.spyOn(telemetry['logger'], 'error')

          telemetry['retries'] = telemetry['MAX_RETRIES']
          telemetry['points'] = [mockMetric]

          await telemetry.flush()
          expect(error).toHaveBeenCalled()
          expect(telemetry['points']).toEqual([])
          expect(telemetry['retries']).toBe(0)
        })
      })
    })

    it('submits a slice of telemetry points to the pool', async () => {
      const submitTelemetry = jest.spyOn(telemetry['workerPool'], 'submitTelemetry')
      const points = Array(telemetry['MAX_POINTS_TO_SUBMIT'] + 1).fill(mockMetric)
      telemetry['points'] = points

      await telemetry.flush()

      expect(submitTelemetry).toHaveBeenCalledWith(
        points.slice(0, telemetry['MAX_POINTS_TO_SUBMIT']),
        GraffitiUtils.fromString(mockGraffiti),
        'https://api.ironfish.network',
      )
      expect(telemetry['points']).toEqual(points.slice(telemetry['MAX_POINTS_TO_SUBMIT']))
      expect(telemetry['points']).toHaveLength(
        points.slice(telemetry['MAX_POINTS_TO_SUBMIT']).length,
      )
      expect(telemetry['retries']).toBe(0)
    })
  })
})
