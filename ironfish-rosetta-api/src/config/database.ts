/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'reflect-metadata'
import { createConnection } from 'typeorm'

import ormConfig from '../../ormconfig'
import { Block, Config, Transaction } from '../entity'

export const connection = createConnection({
  ...ormConfig,
  entities: [Block, Config, Transaction],
  synchronize: true,
  logging: ['error'],
})
