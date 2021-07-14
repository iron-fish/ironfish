/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Injectable } from '@nestjs/common'
import { DEFAULT_LIMIT, MAX_LIMIT } from '../common/constants'
import { PrismaService } from '../prisma/prisma.service'
import { ListEventsOptions } from './interfaces/list-events-options'
import { Event, Prisma } from '.prisma/client'

@Injectable()
export class EventsService {
  constructor(private prisma: PrismaService) {}

  async find(input: Prisma.EventWhereUniqueInput): Promise<Event | null> {
    return this.prisma.event.findUnique({
      where: input,
    })
  }

  async list(options: ListEventsOptions): Promise<Event[]> {
    const backwards = options.before !== undefined
    const cursorId = options.before ?? options.after
    const cursor = cursorId ? { id: cursorId } : undefined
    const limit = Math.min(MAX_LIMIT, options.limit || DEFAULT_LIMIT)
    const order = backwards ? 'desc' : 'asc'
    const skip = cursor ? 1 : 0
    return this.prisma.event.findMany({
      cursor,
      orderBy: {
        id: order,
      },
      skip,
      take: limit,
      where: {
        account_id: options.accountId,
      },
    })
  }
}
