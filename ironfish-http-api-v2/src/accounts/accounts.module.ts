/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { AccountsController } from './accounts.controller'
import { AccountsService } from './accounts.service'

@Module({
  controllers: [AccountsController],
  exports: [AccountsService],
  imports: [PrismaModule],
  providers: [AccountsService],
})
export class AccountsModule {}
