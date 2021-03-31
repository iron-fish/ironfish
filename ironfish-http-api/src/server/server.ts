/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import express from 'express'
import * as OpenApiValidator from 'express-openapi-validator'
import { Express } from 'express-serve-static-core'
import { connector } from 'swagger-routes-express'
import swaggerUi from 'swagger-ui-express'
import bodyParser from 'body-parser'

import { errorHandler } from '../middleware/errorHandler'
import OpenAPIDefinition from '../config/openapi.json'
import * as api from '../controllers'
import { Logger } from '../utils/logger'
import http from 'http'

export class Server {
  app: Express
  httpServer: http.Server | null = null
  isOpen = false
  openPromise: Promise<unknown> | null = null

  constructor() {
    const app = express()

    app.use(bodyParser.json())

    // Setup API validator
    const validatorOptions = {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-explicit-any
      apiSpec: <any>OpenAPIDefinition,
      validateRequests: true,
      validateResponses: true,
    }
    // Route for health check
    // TODO - return a real health check system
    app.get('/healthcheck', (req, res) => res.end())
    // Route for api documentation
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(OpenAPIDefinition))
    app.use(OpenApiValidator.middleware(validatorOptions))
    app.use(errorHandler)

    connector(api, validatorOptions.apiSpec)(app)

    this.app = app
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

  async close(): Promise<void> {
    if (!this.isOpen) return
    this.isOpen = false
    await this.openPromise

    Logger.info('App server is starting shutdown')

    const httpServer = this.httpServer

    if (httpServer) {
      await new Promise<void>((resolve, reject) => {
        httpServer.close((err: unknown) => {
          if (err) reject(err)
          else resolve()
        })
      })
    }

    Logger.info('App server is no longer open for connections')
  }
}
