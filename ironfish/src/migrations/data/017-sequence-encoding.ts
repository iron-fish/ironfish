/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Logger } from '../../logger'
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
import { Database, Migration, MigrationContext } from '../migration'

export class Migration017 extends Migration {
  path = __filename
  database = Database.WALLET

  prepare(context: MigrationContext): IDatabase {
    return context.wallet.walletDb.db
  }

  async forward(
    context: MigrationContext,
    db: IDatabase,
    tx: IDatabaseTransaction | undefined,
    logger: Logger,
  ): Promise<void> {
    logger.info('Clearing data from old datastores...')
    const { sequenceToNoteHash, sequenceToTransactionHash, pendingTransactionHashes } =
      this.getOldStores(db)

    await sequenceToNoteHash.clear()
    await sequenceToTransactionHash.clear()
    await pendingTransactionHashes.clear()
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async backward(): Promise<void> {}

  getOldStores(db: IDatabase): {
    sequenceToNoteHash: IDatabaseStore<DatabaseSchema>
    sequenceToTransactionHash: IDatabaseStore<DatabaseSchema>
    pendingTransactionHashes: IDatabaseStore<DatabaseSchema>
  } {
    const sequenceToNoteHash = db.addStore({
      name: 's',
      keyEncoding: new PrefixEncoding(
        new BufferEncoding(),
        new PrefixEncoding(U32_ENCODING_BE, new BufferEncoding(), 4),
        4,
      ),
      valueEncoding: NULL_ENCODING,
    })

    const sequenceToTransactionHash = db.addStore({
      name: 'st',
      keyEncoding: new PrefixEncoding(
        new BufferEncoding(),
        new PrefixEncoding(U32_ENCODING_BE, new BufferEncoding(), 4),
        4,
      ),
      valueEncoding: NULL_ENCODING,
    })

    const pendingTransactionHashes = db.addStore({
      name: 'p',
      keyEncoding: new PrefixEncoding(
        new BufferEncoding(),
        new PrefixEncoding(U32_ENCODING_BE, new BufferEncoding(), 4),
        4,
      ),
      valueEncoding: NULL_ENCODING,
    })

    return { sequenceToNoteHash, sequenceToTransactionHash, pendingTransactionHashes }
  }
}
