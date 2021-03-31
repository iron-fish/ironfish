/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { errorHandler } from './errorHandler'
import { Request, Response } from 'express'

const mockResponse = () => {
  const res = {} as Response
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  return res
}

describe('errorHandler middleware', () => {
  it('should return the right error response', () => {
    const response = mockResponse()
    const error = { status: 401, message: 'not authorized' }
    errorHandler(error, {} as Request, response, jest.fn())
    expect(response.json).toHaveBeenCalledWith({
      error: {
        message: 'not authorized',
        type: 'request_validation',
      },
    })
  })

  it('should not handle the unexpected error', () => {
    const next = jest.fn()
    const error = { message: 'not authorized' }
    errorHandler(error, {} as Request, mockResponse(), next)
    expect(next).toHaveBeenCalledWith(error)
  })
})
