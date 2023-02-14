/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Logger } from '../../logger'
import { IronfishNode } from '../../node'
import {
  IDatabase,
  IDatabaseTransaction,
} from '../../storage'
import { Account } from '../../wallet'
import { AccountImport} from '../../wallet/account'
import { Migration } from '../migration'

export class Migration021 extends Migration {
  path = __filename

  prepare(node: IronfishNode): IDatabase {
    return node.wallet.walletDb.db
  }

  async forward(
    node: IronfishNode,
    _db: IDatabase,
    _tx: IDatabaseTransaction | undefined,
    logger: Logger,
  ): Promise<void> {
    const accounts = []
    // TODO: does this serialize/deserialize correctly? it assumes Version already exists when it in fact does not.
    logger.debug(`Loading accounts from wallet db...`)
    for await (const accountValue of node.wallet.walletDb.loadAccounts()) {
      accounts.push(
        new Account({
          ...accountValue,
          walletDb: node.wallet.walletDb,
          version: 1,
        }),
      )
    } 
    
    logger.debug(`Clearing old accounts from wallet db...`)
    await node.wallet.walletDb.accounts.clear()

    logger.debug(`Saving updated accounts to wallet db...`)
    for (const account of accounts) {
      const importRequest = {
        name: account.name,
        spendingKey: account.spendingKey,
        version: account.version,
      }
      await node.wallet.importAccount(importRequest as AccountImport)
    }
  }

  async backward(node: IronfishNode, db: IDatabase): Promise<void> {
    // TODO something that undoes the migration? Some migrations don't implement this though?
    throw new Error('Not implemented')
  }

}
