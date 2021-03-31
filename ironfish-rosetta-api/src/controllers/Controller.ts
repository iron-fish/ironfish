/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Request, Response } from 'express'
import { requestHandler } from '../middleware/requestHandler'
import { AppRouteHandlers } from '../server/server'

type ResponseStatusSuccess = 200
type ResponseStatusError = 400 | 500
type ResponseBody = Record<string, unknown> | string

export type ResponsePayload = {
  body: ResponseBody
  status: ResponseStatusSuccess
}

export type ResponseError = {
  status: ResponseStatusError
  error: string
  message: string
  retriable: boolean
}

export const SendResponse = (response: Response, payload: ResponsePayload): void => {
  response.status(payload.status || 200)
  response.setHeader('content-type', 'application/json')

  if (payload.body instanceof Object) {
    response.json(payload.body)
  } else {
    response.send(payload.body)
    response.end()
  }
}

export const SendError = (response: Response, error: ResponseError): void => {
  response.status(error.status || 500)
  response.json({ error: error.message })
  response.end()
}

export const SuccessResponse = (payload: Record<string, unknown>): ResponsePayload => {
  return { body: payload, status: 200 }
}

export const HandleRequest = async (request: Request, response: Response): Promise<void> => {
  try {
    const app = request.app as AppRouteHandlers

    const responseHandler = await requestHandler(app, request, response)
    const responsePayload = SuccessResponse(responseHandler)

    SendResponse(response, responsePayload)
  } catch (error) {
    SendError(response, error)
  }
}
