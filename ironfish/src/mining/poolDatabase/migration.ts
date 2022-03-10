/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Database } from 'sqlite'

export abstract class Migration {
  id = 0
  abstract name: string

  init(): Migration {
    this.id = Number(this.name.split('-')[0])
    return this
  }

  abstract forward(db: Database): Promise<void>
  abstract backward(db: Database): Promise<void>
}
