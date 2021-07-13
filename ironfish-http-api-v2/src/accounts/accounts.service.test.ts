/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { INestApplication } from '@nestjs/common'
import { v4 as uuid } from 'uuid'
import { PrismaService } from '../prisma/prisma.service'
import { bootstrapTestApp } from '../test/test-app'
import { AccountsService } from './accounts.service'

describe('AccountsService', () => {
  let app: INestApplication
  let accountsService: AccountsService
  let prisma: PrismaService

  beforeAll(async () => {
    app = await bootstrapTestApp()
    accountsService = app.get(AccountsService)
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
        const record = await accountsService.find({ id: account.id })
        expect(record).not.toBeNull()
        expect(record).toMatchObject(account)
      })
    })

    describe('with a missing id', () => {
      it('returns null', async () => {
        const record = await accountsService.find({ id: 1337 })
        expect(record).toBeNull()
      })
    })
  })
})
