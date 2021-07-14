/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { HttpStatus, INestApplication } from '@nestjs/common'
import request from 'supertest'
import { v4 as uuid } from 'uuid'
import { PrismaService } from '../prisma/prisma.service'
import { bootstrapTestApp } from '../test/test-app'
import { MetricsGranularity } from './enums/metrics-granularity'

describe('AccountsController', () => {
  let app: INestApplication
  let prisma: PrismaService

  beforeAll(async () => {
    app = await bootstrapTestApp()
    prisma = app.get(PrismaService)
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  describe('GET /accounts/:id', () => {
    describe('with a valid id', () => {
      it('returns the account', async () => {
        const account = await prisma.account.create({
          data: {
            public_address: uuid(),
          },
        })
        const { body } = await request(app.getHttpServer())
          .get(`/accounts/${account.id}`)
          .expect(HttpStatus.OK)

        expect(body).toMatchObject({
          id: account.id,
          public_address: account.public_address,
        })
      })
    })

    describe('with a missing id', () => {
      it('returns a 404', async () => {
        await request(app.getHttpServer()).get('/accounts/123').expect(HttpStatus.NOT_FOUND)
      })
    })
  })

  describe('GET /accounts/:id/metrics', () => {
    describe('with start but no end', () => {
      it('returns a 422', async () => {
        const { body } = await request(app.getHttpServer())
          .get('/accounts/123/metrics')
          .query({
            start: new Date().toISOString(),
            granularity: MetricsGranularity.TOTAL,
          })
          .expect(HttpStatus.UNPROCESSABLE_ENTITY)

        expect(body).toMatchSnapshot()
      })
    })

    describe('with end but no start', () => {
      it('returns a 422', async () => {
        const { body } = await request(app.getHttpServer())
          .get('/accounts/123/metrics')
          .query({
            end: new Date().toISOString(),
            granularity: MetricsGranularity.TOTAL,
          })
          .expect(HttpStatus.UNPROCESSABLE_ENTITY)

        expect(body).toMatchSnapshot()
      })
    })

    describe('with a missing granularity', () => {
      it('returns a 422', async () => {
        const { body } = await request(app.getHttpServer())
          .get('/accounts/123/metrics')
          .expect(HttpStatus.UNPROCESSABLE_ENTITY)

        expect(body).toMatchSnapshot()
      })
    })

    describe('with a time range for a LIFETIME request', () => {
      it('returns a 422', async () => {
        const { body } = await request(app.getHttpServer())
          .get('/accounts/123/metrics')
          .query({
            start: new Date().toISOString(),
            end: new Date().toISOString(),
            granularity: MetricsGranularity.LIFETIME,
          })
          .expect(HttpStatus.UNPROCESSABLE_ENTITY)

        expect(body).toMatchSnapshot()
      })
    })

    describe('with start after end', () => {
      it('returns a 422', async () => {
        const start = new Date().toISOString()
        const end = new Date(Date.now() - 1).toISOString()
        const { body } = await request(app.getHttpServer())
          .get('/accounts/123/metrics')
          .query({
            start,
            end,
            granularity: MetricsGranularity.TOTAL,
          })
          .expect(HttpStatus.UNPROCESSABLE_ENTITY)

        expect(body).toMatchSnapshot()
      })
    })

    describe('with a time range longer than the supported range', () => {
      it('returns a 422', async () => {
        const start = '2021-06-01T00:00:00.000Z'
        const end = '2021-08-01T00:00:00.000Z'
        const { body } = await request(app.getHttpServer())
          .get('/accounts/123/metrics')
          .query({
            start,
            end,
            granularity: MetricsGranularity.TOTAL,
          })
          .expect(HttpStatus.UNPROCESSABLE_ENTITY)

        expect(body).toMatchSnapshot()
      })
    })

    describe('with a TOTAL request and no time range', () => {
      it('returns a 422', async () => {
        const { body } = await request(app.getHttpServer())
          .get('/accounts/123/metrics')
          .query({
            granularity: MetricsGranularity.TOTAL,
          })
          .expect(HttpStatus.UNPROCESSABLE_ENTITY)

        expect(body).toMatchSnapshot()
      })
    })

    describe('with a missing account', () => {
      it('returns a 404', async () => {
        const start = new Date(Date.now() - 1).toISOString()
        const end = new Date().toISOString()
        await request(app.getHttpServer())
          .get('/accounts/12345/metrics')
          .query({
            start,
            end,
            granularity: MetricsGranularity.TOTAL,
          })
          .expect(HttpStatus.NOT_FOUND)
      })
    })
  })
})
