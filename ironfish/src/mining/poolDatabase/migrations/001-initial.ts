/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Database } from 'sqlite'
import { Migration } from '../migration'

export default class Migration001 extends Migration {
  name = '001-initial'

  async forward(db: Database): Promise<void> {
    await db.run(`
      CREATE TABLE payout (
        id INTEGER PRIMARY KEY,
        createdAt INTEGER NOT NULL DEFAULT CURRENT_TIMESTAMP,
        succeeded BOOLEAN DEFAULT FALSE
      );
    `)

    await db.run(`
      CREATE TABLE share (
        id INTEGER PRIMARY KEY,
        publicAddress TEXT NOT NULL,
        createdAt INTEGER NOT NULL DEFAULT CURRENT_TIMESTAMP,
        payoutId INTEGER,
        CONSTRAINT share_fk_payout_id FOREIGN KEY (payoutId) REFERENCES payout (id)
      );
    `)
  }

  async backward(db: Database): Promise<void> {
    await db.run('DROP TABLE payout;')
    await db.run('DROP TABLE share;')
  }
}
