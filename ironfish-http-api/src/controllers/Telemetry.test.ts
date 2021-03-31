/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import request from 'supertest'
import { Express } from 'express-serve-static-core'

import { Server } from '../server/server'

const influxWriter = jest.fn()
const PointMock = {
  stringField: jest.fn(),
  intField: jest.fn(),
  floatField: jest.fn(),
  booleanField: jest.fn(),
  tag: jest.fn(),
  timestamp: jest.fn(),
}
jest.mock('../utils/logger')
jest.mock('@influxdata/influxdb-client', () => {
  return {
    InfluxDB: jest.fn().mockImplementation(() => {
      return {
        getWriteApi: jest.fn().mockImplementation(() => {
          return { writePoints: influxWriter }
        }),
      }
    }),
    Point: jest.fn().mockImplementation(() => {
      return PointMock
    }),
  }
})

describe('POST /writeTelemetry', () => {
  let server: Express
  beforeAll(() => {
    server = new Server().app
  })

  it('should return 200 with valid input', async () => {
    const result = await request(server)
      .post('/api/v1/writeTelemetry')
      .send([
        {
          name: 'finallyOver',
          timestamp: new Date('2020-12-31T23:59:59.999Z'),
          fields: [{ name: 'betterNow', boolean: true }],
        },
      ])
    expect(result.status).toEqual(200)
    expect(PointMock.booleanField).toHaveBeenCalledWith('betterNow', true)
    expect(PointMock.tag).not.toHaveBeenCalled()
    expect(PointMock.timestamp).toHaveBeenCalledTimes(1)
    expect(PointMock.timestamp.mock.calls[0]).toEqual([new Date('2020-12-31T23:59:59.999Z')])
    expect(influxWriter).toHaveBeenCalledTimes(1)
  })
})
