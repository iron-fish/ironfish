/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Database } from 'sqlite'
import { Migration } from '../migration'

export default class Migration009 extends Migration {
  name = '009-remove-old-tables'

  async forward(db: Database): Promise<void> {
    await db.run('DROP INDEX IF EXISTS idx_share_public_address;')
    await db.run('DROP INDEX IF EXISTS idx_share_created_at;')
    await db.run('DROP TABLE IF EXISTS payout;')
    await db.run('DROP TABLE IF EXISTS share;')
  }

  async backward(db: Database): Promise<void> {
    await db.run(`
      CREATE TABLE payout (
        id INTEGER PRIMARY KEY,
        createdAt INTEGER NOT NULL DEFAULT CURRENT_TIMESTAMP,
        succeeded BOOLEAN DEFAULT FALSE,
        transactionHash TEXT
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

    await db.run(`CREATE INDEX idx_share_created_at ON share (createdAt);`)
    await db.run(`CREATE INDEX idx_share_public_address ON share (publicAddress);`)
  }
}
