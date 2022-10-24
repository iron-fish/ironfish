/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Database } from 'sqlite'
import { Migration } from '../migration'

export default class Migration002 extends Migration {
  name = '003-add-transaction-hash'

  async forward(db: Database): Promise<void> {
    await db.run(`
      ALTER TABLE payout ADD COLUMN transactionHash TEXT;
    `)
  }

  async backward(db: Database): Promise<void> {
    await db.run(`
      ALTER TABLE payout DROP COLUMN transactionHash;
    `)
  }
}
