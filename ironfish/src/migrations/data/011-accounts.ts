/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { IronfishSdk } from '../../sdk'
import { IDatabase } from '../../storage'
import { createDB } from '../../storage/utils'
import { Migration } from '../migration'

export default class Migration001 extends Migration {
  name = '011-accounts'

  prepare(sdk: IronfishSdk): IDatabase {
    return createDB({ location: sdk.config.accountDatabasePath })
  }

  async forward(sdk: IronfishSdk): Promise<void> {
    // Assert.isNotUndefined(this.accounts)
    // Assert.isNotUndefined(this.chain)

    // const { meta, accounts, noteToNullifier, nullifierToNote, transactions } = loadStores(
    //   this.accounts,
    // )

    // for await (const transaction of transactions.getAllValuesIter()) {
    //   console.log('EH', JSON.stringify(transaction, null, '  '))
    // }

    throw new Error()

    // noteToNullifier.clear()
  }

  async backward(): Promise<void> {}
}
