/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Database } from 'sqlite'
import { Migration } from '../migration'

export default class Migration005 extends Migration {
  name = '005-add-payout-period-table'

  async forward(db: Database): Promise<void> {
    await db.run(`
      CREATE TABLE payoutPeriod (
        id INTEGER PRIMARY KEY,
        createdAt INTEGER NOT NULL DEFAULT CURRENT_TIMESTAMP,
        start INTEGER NOT NULL,
        end INTEGER
      );
    `)
  }

  async backward(db: Database): Promise<void> {
    await db.run('DROP TABLE IF EXISTS payoutPeriod;')
  }
}
