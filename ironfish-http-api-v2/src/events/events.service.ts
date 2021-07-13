/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { Event, Prisma } from '.prisma/client'

@Injectable()
export class EventsService {
  constructor(private prisma: PrismaService) {}

  async find(input: Prisma.EventWhereUniqueInput): Promise<Event | null> {
    return this.prisma.event.findUnique({
      where: input,
    })
  }
}
