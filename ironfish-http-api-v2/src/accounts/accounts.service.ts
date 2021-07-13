/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { Account } from '.prisma/client'
import { Prisma } from '.prisma/client'

@Injectable()
export class AccountsService {
  constructor(private prisma: PrismaService) {}

  async find(input: Prisma.AccountWhereUniqueInput): Promise<Account | null> {
    return this.prisma.account.findUnique({
      where: input,
    })
  }
}
