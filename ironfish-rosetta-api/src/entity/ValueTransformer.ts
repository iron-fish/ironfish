/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ValueTransformer } from 'typeorm'

export const bigint: ValueTransformer = {
  to: (entityValue: number) => entityValue,
  from: (databaseValue: string): number => parseInt(databaseValue, 10),
}

export const timestamp: ValueTransformer = {
  to: (entityValue: number) => {
    return new Date(entityValue).toISOString()
  },
  from: (databaseValue: string): number => new Date(databaseValue).getTime(),
}
