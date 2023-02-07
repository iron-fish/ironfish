/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Logger } from '../../logger'
import { IronfishNode } from '../../node'
import {
  BufferEncoding,
  DatabaseSchema,
  IDatabase,
  IDatabaseStore,
  IDatabaseTransaction,
  NULL_ENCODING,
  PrefixEncoding,
  U32_ENCODING_BE,
} from '../../storage'
import { Account } from '../../wallet'
import { Migration } from '../migration'

export class Migration017 extends Migration {
  path = __filename

  prepare(node: IronfishNode): IDatabase {
    return node.wallet.walletDb.db
  }

  async forward(
    node: IronfishNode,
    logger: Logger,
  ): Promise<void> {
    // TODO something that does the migration
    const accounts = []
    // TODO: does this serialize/deserialize correctly?
    for await (const accountValue of node.wallet.walletDb.loadAccounts()) {
      accounts.push(
        new Account({
          ...accountValue,
          walletDb: node.wallet.walletDb,
          version: 1 
        }),
      )
    } 
    
    // TODO: somehow save the accounts
  }

  async backward(node: IronfishNode, db: IDatabase): Promise<void> {
    // TODO something that undoes the migration
    throw new Error('Not implemented')
  }

}
