/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { KEY_LENGTH, PUBLIC_ADDRESS_LENGTH } from '@ironfish/rust-nodejs'
import bufio from 'bufio'
import { Logger } from '../../logger'
import { IronfishNode } from '../../node'
import { IDatabaseEncoding, IDatabaseStore, StringEncoding } from '../../storage'
import { IDatabase, IDatabaseTransaction } from '../../storage'
import { Account } from '../../wallet'
import { Migration } from '../migration'

export class Migration023 extends Migration {
  path = __filename

  prepare(node: IronfishNode): IDatabase {
    return node.wallet.walletDb.db
  }

  async forward(
    node: IronfishNode,
    db: IDatabase,
    tx: IDatabaseTransaction | undefined,
    logger: Logger,
  ): Promise<void> {
    const { walletDb } = node.wallet
    const accounts: Account[] = []

    const oldAccountStore = this.getOldAccountStore(db)
    logger.info(`Gathering accounts for migration`)
    for await (const accountValue of oldAccountStore.getAllValuesIter(tx)) {
      accounts.push(
        new Account({
          ...accountValue,
          walletDb: node.wallet.walletDb,
        }),
      )
    }

    logger.info(`Making wallet compatible with view only accounts`)
    await walletDb.db.transaction(async (tx) => {
      for (const account of accounts) {
        logger.info('')
        logger.info(`  Migrating account ${account.name}`)
        // reserialization of existing wallet will occur in here
        await walletDb.setAccount(account, tx)
        logger.info(`  Completed migration for account ${account.name}`)
      }
    })

    await oldAccountStore.clear(tx)
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async backward(): Promise<void> {}

  getOldAccountStore(
    db: IDatabase,
  ): IDatabaseStore<{ key: string; value: PreMigrationAccountValue }> {
    return db.addStore({
      name: 'a',
      keyEncoding: new StringEncoding(),
      valueEncoding: new PreMigrationAccountValueEncoding(),
    })
  }
}

interface PreMigrationAccountValue {
  id: string
  name: string
  spendingKey: string
  incomingViewKey: string
  outgoingViewKey: string
  publicAddress: string
}

class PreMigrationAccountValueEncoding implements IDatabaseEncoding<PreMigrationAccountValue> {
  serialize(value: PreMigrationAccountValue): Buffer {
    const bw = bufio.write(this.getSize(value))
    bw.writeVarString(value.id, 'utf8')
    bw.writeVarString(value.name, 'utf8')
    bw.writeBytes(Buffer.from(value.spendingKey, 'hex'))
    bw.writeBytes(Buffer.from(value.incomingViewKey, 'hex'))
    bw.writeBytes(Buffer.from(value.outgoingViewKey, 'hex'))
    bw.writeBytes(Buffer.from(value.publicAddress, 'hex'))

    return bw.render()
  }

  deserialize(buffer: Buffer): PreMigrationAccountValue {
    const reader = bufio.read(buffer, true)
    const id = reader.readVarString('utf8')
    const name = reader.readVarString('utf8')
    const spendingKey = reader.readBytes(KEY_LENGTH).toString('hex')
    const incomingViewKey = reader.readBytes(KEY_LENGTH).toString('hex')
    const outgoingViewKey = reader.readBytes(KEY_LENGTH).toString('hex')
    const publicAddress = reader.readBytes(PUBLIC_ADDRESS_LENGTH).toString('hex')

    return {
      id,
      name,
      spendingKey,
      incomingViewKey,
      outgoingViewKey,
      publicAddress,
    }
  }

  getSize(value: PreMigrationAccountValue): number {
    let size = 0
    size += bufio.sizeVarString(value.id, 'utf8')
    size += bufio.sizeVarString(value.name, 'utf8')
    size += KEY_LENGTH
    size += KEY_LENGTH
    size += KEY_LENGTH
    size += PUBLIC_ADDRESS_LENGTH

    return size
  }
}
