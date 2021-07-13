/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { INestApplication } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { AccountsModule } from '../accounts/accounts.module'
import { EventsModule } from '../events/events.module'
import { HealthModule } from '../health/health.module'

export async function bootstrapTestApp(): Promise<INestApplication> {
  const module = await Test.createTestingModule({
    imports: [
      AccountsModule,
      ConfigModule.forRoot({
        isGlobal: true,
      }),
      EventsModule,
      HealthModule,
    ],
  }).compile()

  return module.createNestApplication()
}
