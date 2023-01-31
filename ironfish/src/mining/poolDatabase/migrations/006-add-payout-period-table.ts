/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Database } from 'sqlite'
import { Migration } from '../migration'

export default class Migration006 extends Migration {
  name = '006-add-payout-period-table'

  async forward(db: Database): Promise<void> {
    await db.run(`
      CREATE TABLE payoutPeriod (
        id INTEGER PRIMARY KEY,
        createdAt INTEGER NOT NULL DEFAULT CURRENT_TIMESTAMP,
        start INTEGER NOT NULL,
        end INTEGER
      );
    `)

    await db.run(`
      ALTER TABLE block ADD payoutPeriodId INTEGER NOT NULL REFERENCES payoutPeriodId (id);
    `)
  }

  async backward(db: Database): Promise<void> {
    await db.run(`ALTER TABLE block DROP COLUMN payoutPeriodId;`)
    await db.run('DROP TABLE IF EXISTS payoutPeriod;')
  }
}
