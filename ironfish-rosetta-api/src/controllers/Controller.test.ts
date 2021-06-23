/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Response } from 'express'
import {
  ResponseError,
  ResponsePayload,
  SendError,
  SendResponse,
  SuccessResponse,
} from './Controller'

describe('Base Controller', () => {
  const response = {} as Response

  beforeEach(() => {
    response.status = jest.fn()
    response.setHeader = jest.fn()
    response.json = jest.fn()
    response.send = jest.fn()
    response.end = jest.fn()
  })

  describe('SuccessResponse', () => {
    it('should return the right object', () => {
      const payload = { key: 'value' }
      expect(SuccessResponse(payload)).toEqual({
        body: payload,
        status: 200,
      })
    })
  })
  describe('SendError', () => {
    it('should return the right error', () => {
      const error: ResponseError = {
        error: 'error message',
        message: 'message',
        retriable: true,
        status: 500,
      }

      SendError(response, error)

      expect(response.status).toHaveBeenCalledWith(500)
      expect(response.json).toHaveBeenCalledWith({
        error: 'message',
      })
    })
  })

  describe('SendResponse', () => {
    it('should return JSON', () => {
      const payload: ResponsePayload = { body: { key: 'value' }, status: 200 }
      SendResponse(response, payload)

      expect(response.status).toHaveBeenCalledWith(200)
      expect(response.json).toHaveBeenCalledWith({ key: 'value' })
    })

    it('should return plain text', () => {
      const payload: ResponsePayload = { body: 'test test', status: 200 }
      SendResponse(response, payload)

      expect(response.status).toHaveBeenCalledWith(200)
      expect(response.json).toHaveBeenCalledTimes(0)
      expect(response.send).toHaveBeenCalledWith('test test')
    })
  })
})
