/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Metric } from '.'
import { handleMetric, sendMetrics, MAX_QUEUE_BEFORE_SUBMIT } from './telemetryBackgroundTask'
import axios from 'axios'

jest.mock('worker_threads')
jest.mock('axios')

describe('Telemetry background thread', () => {
  const postMock = jest.fn().mockImplementation(() => Promise.resolve({}))
  axios.post = postMock
  const metric: Metric = {
    name: 'test metric',
    timestamp: new Date('2020-12-31'),
    fields: [{ name: 'hello', type: 'string', value: 'world' }],
  }
  const endpoint = 'http://localhost:8000/writeMetric'

  afterEach(() => {
    postMock.mockClear()
  })

  it('posts a metric', () => {
    handleMetric(metric, endpoint)
    expect(postMock).not.toHaveBeenCalled()
    sendMetrics(endpoint)
    expect(axios.post).toHaveBeenCalledWith('http://localhost:8000/writeMetric', [
      {
        name: 'test metric',
        timestamp: new Date('2020-12-31'),
        fields: [{ name: 'hello', string: 'world' }],
      },
    ])
  })

  it('posts immediately if there are many metrics', () => {
    for (let i = 0; i < MAX_QUEUE_BEFORE_SUBMIT; i++) {
      handleMetric(metric, endpoint)
    }
    expect(postMock).not.toHaveBeenCalled()
    handleMetric(metric, endpoint)
    expect(postMock).toHaveBeenCalled()
  })
})
