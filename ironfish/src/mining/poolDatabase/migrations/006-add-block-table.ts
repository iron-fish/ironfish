/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Database } from 'sqlite'
import { Migration } from '../migration'

export default class Migration006 extends Migration {
  name = '006-add-block-table'

  async forward(db: Database): Promise<void> {
    await db.run(`
      CREATE TABLE block (
        id INTEGER PRIMARY KEY,
        createdAt INTEGER NOT NULL DEFAULT CURRENT_TIMESTAMP,
        blockSequence INTEGER NOT NULL,
        blockHash TEXT NOT NULL,
        minerReward TEXT NOT NULL,
        confirmed BOOLEAN DEFAULT FALSE,
        main BOOLEAN DEFAULT TRUE,
        payoutPeriodId INTEGER NOT NULL,
        CONSTRAINT block_fk_payoutPeriodId FOREIGN KEY (payoutPeriodId) REFERENCES payoutPeriod (id)
      );
    `)
  }

  async backward(db: Database): Promise<void> {
    await db.run('DROP TABLE IF EXISTS block;')
  }
}
