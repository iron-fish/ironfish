/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Worker } from 'worker_threads'
import {
  DisabledTelemetry,
  EnabledTelemetry,
  Metric,
  setDefaultTags,
  setTelemetry,
  submitMetric,
} from '.'

jest.mock('worker_threads')
// Tell typescript to treat it as a mock
const MockWorker = (Worker as unknown) as jest.Mock<Worker>

describe('Enabled and disabled telemetry', () => {
  const metric: Metric = {
    name: 'test metric',
    timestamp: new Date('2020-12-31'),
    fields: [{ name: 'hello', type: 'string', value: 'world' }],
  }

  beforeEach(() => {
    MockWorker.mockReset()
  })

  it("doesn't crash when submitting a metric to disabled telemetry", () => {
    const telemetry = new DisabledTelemetry()
    expect(() => telemetry.submit(metric)).not.toThrow()
    expect(Worker).not.toHaveBeenCalled()
  })

  it('submits to the worker when submitting to enabled telemetry', () => {
    const telemetry = new EnabledTelemetry('an url')
    expect(() => telemetry.submit(metric)).not.toThrow()
    expect(telemetry.worker.postMessage).toMatchInlineSnapshot(`
      [MockFunction] {
        "calls": Array [
          Array [
            Object {
              "fields": Array [
                Object {
                  "name": "hello",
                  "type": "string",
                  "value": "world",
                },
              ],
              "name": "test metric",
              "timestamp": 2020-12-31T00:00:00.000Z,
            },
          ],
        ],
        "results": Array [
          Object {
            "type": "return",
            "value": undefined,
          },
        ],
      }
    `)
  })
})

describe('Telemetry submitMetric function', () => {
  const metric: Metric = {
    name: 'test metric',
    timestamp: new Date('2020-12-31'),
    tags: { 'you know': 'me' },
    fields: [{ name: 'hello', type: 'string', value: 'world' }],
  }

  const telemetry = new DisabledTelemetry()
  const mockSubmit = jest.fn()
  telemetry.submit = mockSubmit
  setTelemetry(telemetry)

  beforeEach(() => {
    mockSubmit.mockClear()
    setDefaultTags({})
  })

  it('Succeeds with a validly formatted metric', () => {
    submitMetric(metric)
    expect(mockSubmit).toMatchSnapshot()
  })

  it('throws if fields is empty', () => {
    const fieldlessMetric = { ...metric }
    fieldlessMetric.fields = []
    expect(() => submitMetric(fieldlessMetric)).toThrowErrorMatchingInlineSnapshot(
      `"Metric must have at least one field"`,
    )
    expect(mockSubmit).not.toBeCalled()
  })

  it('submits with no tags if unspecified', () => {
    const taglessMetric = { ...metric }
    delete taglessMetric.tags
    submitMetric(taglessMetric)
    expect(mockSubmit).toMatchSnapshot()
  })

  it('submits with default tags', () => {
    setDefaultTags({ my: 'default tag' })
    submitMetric(metric)
    const expectedMetric = {
      ...metric,
      tags: { my: 'default tag', 'you know': 'me' },
    }
    expect(mockSubmit.mock.calls).toMatchObject([[expectedMetric]])
  })

  it('submits with default date if unspecified', () => {
    const now = new Date('1999-12-31')
    jest.spyOn(global, 'Date').mockImplementation(() => (now as unknown) as string)
    const datelessMetric = { ...metric }
    delete datelessMetric.timestamp
    submitMetric(datelessMetric)
    expect(mockSubmit).toMatchSnapshot()
  })
})
