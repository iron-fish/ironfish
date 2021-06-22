/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Request, Response } from 'express'
import { Routes } from '../config'
import { AppRouteHandlers } from '../server'

type RequestBodyType = Record<string, unknown>
export type RequestHandlerParams<RequestBodyType> = {
  params: RequestBodyType
  request?: Request
  response?: Response
}

export const requestHandler = async (
  app: AppRouteHandlers,
  request: Request,
  response: Response,
): Promise<Record<string, unknown>> => {
  const routeHandlers = app.routeHandlers
  const route = request.route as Record<string, unknown>
  if (!route || !route.path) {
    throw new Error(`No route path found`)
  }

  const path = route.path as Routes
  const routeHandler = routeHandlers[path]
  if (!routeHandler || !routeHandler.service) {
    throw new Error(`Service for ${path} is not yet implemented`)
  }

  const requestParams: RequestHandlerParams<RequestBodyType> = {
    params: request.body as RequestBodyType,
    request,
    response,
  }

  // Todo - add type guards for the different response
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return await routeHandler.service(requestParams)
}
