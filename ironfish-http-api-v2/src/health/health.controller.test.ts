/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { HttpStatus, INestApplication } from '@nestjs/common'
import request from 'supertest'
import { bootstrapTestApp } from '../test/test-app'

describe('HealthController', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await bootstrapTestApp()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  describe('GET /health', () => {
    it('returns a 200 status code', async () => {
      await request(app.getHttpServer()).get('/health').expect(HttpStatus.OK)
    })
  })
})
