/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import bodyParser from 'body-parser'
import cors from 'cors'
import express from 'express'
import * as OpenApiValidator from 'express-openapi-validator'
import { Express } from 'express-serve-static-core'
import http from 'http'
import { connector } from 'swagger-routes-express'
import swaggerUi from 'swagger-ui-express'
import { OpenAPIDefinition } from '../config/openapi'
import { Routes } from '../config/routes'
import * as api from '../controllers'
import { errorHandler } from '../middleware/errorHandler'
import { Logger } from '../utils/logger'

// eslint-disable-next-line @typescript-eslint/ban-types
export type RouteHandlerMap = Record<Routes, { service: Function }>

export interface AppRouteHandlers extends Express {
  routeHandlers: RouteHandlerMap
}

const options: cors.CorsOptions = {
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'X-Access-Token'],
  credentials: true,
  methods: 'GET,HEAD,OPTIONS,PUT,PATCH,POST,DELETE',
  origin: '*',
  preflightContinue: false,
}

export class Server {
  app: AppRouteHandlers
  httpServer: http.Server | null = null
  isOpen = false
  openPromise: Promise<unknown> | null = null

  constructor() {
    const app = express() as AppRouteHandlers
    const corsOptions = cors(options)
    app.use(corsOptions)

    app.use(bodyParser.json())
    app.use(bodyParser.text())
    app.use(bodyParser.urlencoded({ extended: false }))

    // Setup API validator
    const validatorOptions = {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-explicit-any
      apiSpec: <any>OpenAPIDefinition,
      validateRequests: true,
      validateResponses: true,
      additionalProperties: false,
    }

    // Route for health check
    // TODO - return a real health check system
    app.get(Routes.HEALTH_CHECK, (req, res) => res.end())
    // Route for api documentation
    app.use(Routes.DOCUMENTATION, swaggerUi.serve, swaggerUi.setup(OpenAPIDefinition))
    app.use(OpenApiValidator.middleware(validatorOptions))
    app.use(errorHandler)

    app.options('*', corsOptions)

    connector(api, validatorOptions.apiSpec)(app)

    this.app = app
    this.app.routeHandlers = {} as RouteHandlerMap
  }

  async open(port: number): Promise<void> {
    this.isOpen = true

    this.openPromise = new Promise<void>((resolve, reject) => {
      const server = this.app.listen(port, (err?: unknown) => {
        if (err) {
          reject(err)
          return
        }

        this.httpServer = server
        resolve()
      })
    })

    await this.openPromise
  }

  // eslint-disable-next-line @typescript-eslint/ban-types
  register(route: Routes, service: Function): void {
    this.app.routeHandlers[route] = { service }
  }

  async close(): Promise<void> {
    if (!this.isOpen) {
      return
    }
    this.isOpen = false
    await this.openPromise

    Logger.info('App server is starting shutdown')

    const httpServer = this.httpServer

    if (httpServer) {
      await new Promise<void>((resolve, reject) => {
        httpServer.close((err: unknown) => {
          if (err) {
            reject(err)
          } else {
            resolve()
          }
        })
      })
    }

    Logger.info('App server is no longer open for connections')
  }
}
