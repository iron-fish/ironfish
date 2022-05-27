/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Database } from 'sqlite'
import { Migration } from '../migration'

export default class Migration002 extends Migration {
  name = '002-add-shares-index'

  async forward(db: Database): Promise<void> {
    await db.run(`
      CREATE INDEX idx_share_created_at ON share (createdAt);
     `)
  }

  async backward(db: Database): Promise<void> {
    await db.run('DROP INDEX IF EXISTS idx_share_created_at;')
  }
}
