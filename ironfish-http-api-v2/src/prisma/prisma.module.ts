/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Module } from '@nestjs/common'
import { PrismaService } from './prisma.service'

@Module({
  exports: [PrismaService],
  providers: [PrismaService],
})
export class PrismaModule {}
