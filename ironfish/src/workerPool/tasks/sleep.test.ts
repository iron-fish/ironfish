/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { serializePayloadToBuffer } from '../../testUtilities'
import { Job } from '../job'
import { SleepRequest, SleepResponse, SleepTask } from './sleep'

describe('SleepRequest', () => {
  it('serializes the object to a buffer and deserializes to the original object', () => {
    const request = new SleepRequest(1000, '')
    const buffer = serializePayloadToBuffer(request)
    const deserializedRequest = SleepRequest.deserializePayload(request.jobId, buffer)
    expect(deserializedRequest).toEqual(request)
  })
})

describe('SleepResponse', () => {
  it('serializes the object to a buffer and deserializes to the original object', () => {
    const response = new SleepResponse(true, 1)
    const buffer = serializePayloadToBuffer(response)
    const deserializedResponse = SleepResponse.deserializePayload(response.jobId, buffer)
    expect(deserializedResponse).toEqual(response)
  })
})

describe('SleepTask', () => {
  describe('execute', () => {
    beforeEach(() => {
      jest.useFakeTimers()
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('sleeps', async () => {
      const task = new SleepTask()
      const request = new SleepRequest(1000, '')
      const job = new Job(request)

      const taskPromise = task.execute(request, job)
      const callback = jest.fn()
      void taskPromise.then(callback)

      expect(callback).not.toHaveBeenCalled()

      jest.advanceTimersByTime(1001)
      const response = await taskPromise

      expect(callback).toHaveBeenCalled()
      expect(response.aborted).toBe(false)
      expect(response.jobId).toBe(request.jobId)
    })

    it('throws error', async () => {
      const task = new SleepTask()
      const request = new SleepRequest(1000, 'error')
      const job = new Job(request)

      await expect(async () => {
        const taskPromise = task.execute(request, job)
        jest.advanceTimersByTime(1001)
        await taskPromise
      }).rejects.toThrow('error')
    })

    it('aborts', async () => {
      const task = new SleepTask()
      const request = new SleepRequest(1000, '')
      const job = new Job(request)

      const taskPromise = task.execute(request, job)
      const callback = jest.fn()
      void taskPromise.then(callback)

      expect(callback).not.toHaveBeenCalled()

      job.abort()

      jest.advanceTimersByTime(1001)
      const response = await taskPromise

      expect(callback).toHaveBeenCalled()
      expect(response.aborted).toBe(true)
      expect(response.jobId).toBe(request.jobId)
    })
  })
})
