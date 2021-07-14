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
  let prisma: PrismaService

  beforeAll(async () => {
    app = await bootstrapTestApp()
    eventsService = app.get(EventsService)
    prisma = app.get(PrismaService)
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  describe('find', () => {
    describe('with a valid id', () => {
      it('returns the record', async () => {
        const account = await prisma.account.create({
          data: {
            public_address: uuid(),
          },
        })
        const event = await prisma.event.create({
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

  describe('list', () => {
    const setup = async () => {
      const account = await prisma.account.create({
        data: {
          public_address: uuid(),
        },
      })
      const firstEvent = await prisma.event.create({
        data: {
          type: EventType.BUG_CAUGHT,
          account_id: account.id,
        },
      })
      const secondEvent = await prisma.event.create({
        data: {
          type: EventType.COMMUNITY_CONTRIBUTION,
          account_id: account.id,
        },
      })
      const thirdEvent = await prisma.event.create({
        data: {
          type: EventType.SOCIAL_MEDIA_PROMOTION,
          account_id: account.id,
        },
      })
      const events = [firstEvent, secondEvent, thirdEvent]
      return { account, events }
    }

    describe('with an account with no events', () => {
      it('returns no records', async () => {
        const account = await prisma.account.create({
          data: {
            public_address: uuid(),
          },
        })
        const records = await eventsService.list({ accountId: account.id })
        expect(records).toHaveLength(0)
      })
    })

    describe('with an account with events', () => {
      describe('with no limit', () => {
        it('returns all the available records', async () => {
          const { account, events } = await setup()
          const records = await eventsService.list({ accountId: account.id })
          const eventIds = new Set(events.map((event) => event.id))
          const recordIds = new Set(records.map((record) => record.id))
          expect(eventIds).toEqual(recordIds)
        })
      })

      describe('with a limit lower than the number of total records', () => {
        it('returns a paginated chunk equal to the limit', async () => {
          const { account } = await setup()
          const limit = 2
          const records = await eventsService.list({ accountId: account.id, limit })
          expect(records).toHaveLength(limit)
          for (const record of records) {
            expect(record.account_id).toBe(account.id)
          }
        })
      })

      describe('with the before cursor', () => {
        it('returns records before the cursor', async () => {
          const { account, events } = await setup()
          events.reverse()
          const lastEventId = events[0].id
          const records = await eventsService.list({
            accountId: account.id,
            before: lastEventId,
          })
          for (const record of records) {
            expect(record.id).toBeLessThan(lastEventId)
            expect(record.account_id).toBe(account.id)
          }
        })
      })

      describe('with the after cursor', () => {
        it('returns records after the cursor', async () => {
          const { account, events } = await setup()
          const firstEventId = events[0].id
          const records = await eventsService.list({
            accountId: account.id,
            after: firstEventId,
          })
          for (const record of records) {
            expect(record.id).toBeGreaterThan(firstEventId)
            expect(record.account_id).toBe(account.id)
          }
        })
      })
    })
  })
})
