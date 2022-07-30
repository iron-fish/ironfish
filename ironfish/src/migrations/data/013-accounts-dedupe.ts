/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { IronfishNode } from '../../node'
import { IDatabase } from '../../storage'
import { createDB } from '../../storage/utils'
import { Migration } from '../migration'

export class Migration013 extends Migration {
  path = __filename

  async prepare(node: IronfishNode): Promise<IDatabase> {
    await node.files.mkdir(node.accounts.db.location, { recursive: true })
    return createDB({ location: node.accounts.db.location })
  }

  async forward(node: IronfishNode): Promise<void> {
    const seenKeys = new Set()
    const duplicateAccounts = []

    for (const account of node.accounts.listAccounts()) {
      if (seenKeys.has(account.spendingKey)) {
        duplicateAccounts.push(account)
      } else {
        seenKeys.add(account.spendingKey)
      }
    }

    for (const duplicateAccount of duplicateAccounts) {
      await node.accounts.removeAccount(duplicateAccount.name)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async backward(): Promise<void> {}
}
