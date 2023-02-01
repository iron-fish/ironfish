/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Database } from 'sqlite'
import { Migration } from '../migration'

export default class Migration007 extends Migration {
  name = '007-add-payout-shares-table'

  async forward(db: Database): Promise<void> {
    await db.run(`
      CREATE TABLE payoutShare (
        id INTEGER PRIMARY KEY,
        createdAt INTEGER NOT NULL DEFAULT CURRENT_TIMESTAMP,
        publicAddress TEXT NOT NULL,
        payoutPeriodId INTEGER NOT NULL,
        CONSTRAINT payoutShare_fk_payoutPeriodId FOREIGN KEY (payoutPeriodId) REFERENCES payoutPeriod (id)
      );
    `)
  }

  async backward(db: Database): Promise<void> {
    await db.run('DROP TABLE IF EXISTS payoutShare;')
  }
}
