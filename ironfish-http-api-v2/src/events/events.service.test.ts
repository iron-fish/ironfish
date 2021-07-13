/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { INestApplication } from '@nestjs/common'
import { v4 as uuid } from 'uuid'
import { PrismaService } from '../prisma/prisma.service'
import { bootstrapTestApp } from '../test/test-app'
import { EventsService } from './events.service'
import { EventType } from '.prisma/client'

describe('EventsService', () => {
  let app: INestApplication
  let eventsService: EventsService
  let prismaService: PrismaService

  beforeAll(async () => {
    app = await bootstrapTestApp()
    prismaService = app.get(PrismaService)
    eventsService = app.get(EventsService)
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  describe('find', () => {
    describe('with a valid id', () => {
      it('returns the record', async () => {
        const account = await prismaService.account.create({
          data: {
            public_address: uuid(),
          },
        })
        const event = await prismaService.event.create({
          data: {
            type: EventType.BUG_CAUGHT,
            account_id: account.id,
          },
        })
        const record = await eventsService.find({ id: event.id })
        expect(record).not.toBeNull()
        expect(record).toMatchObject(event)
      })
    })

    describe('with a missing id', () => {
      it('returns null', async () => {
        const record = await eventsService.find({ id: 1337 })
        expect(record).toBeNull()
      })
    })
  })
})
