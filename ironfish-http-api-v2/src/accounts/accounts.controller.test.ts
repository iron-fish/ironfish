/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { HttpStatus, INestApplication } from '@nestjs/common'
import request from 'supertest'
import { v4 as uuid } from 'uuid'
import { PrismaService } from '../prisma/prisma.service'
import { bootstrapTestApp } from '../test/test-app'

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
})
