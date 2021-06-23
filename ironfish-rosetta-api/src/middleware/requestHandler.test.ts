/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Request, Response } from 'express'
import { Routes } from '../config/routes'
import { AppRouteHandlers, RouteHandlerMap } from '../server/server'
import { requestHandler } from './requestHandler'

const spyService = jest.fn()

const request = {} as Request
const response = {} as Response

const app = {} as AppRouteHandlers

app.routeHandlers = {} as RouteHandlerMap
app.routeHandlers[Routes.NETWORK_STATUS] = { service: spyService }

describe('requestHandler middleware', () => {
  it('should throw an error if the path is not found', async () => {
    await expect(requestHandler(app, request, response)).rejects.toThrow('No route path found')
  })

  it('should call the right service', async () => {
    const requestDefined = {} as Request
    requestDefined.body = { key: 'value' }
    requestDefined.route = {
      path: Routes.NETWORK_STATUS,
    }

    await requestHandler(app, requestDefined, response)

    expect(spyService).toHaveBeenCalledWith({
      params: requestDefined.body,
      request: requestDefined,
      response,
    })
  })
})
