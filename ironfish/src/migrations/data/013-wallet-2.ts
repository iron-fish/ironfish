/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import fsAsync from 'fs/promises'
import MurmurHash3 from 'imurmurhash'
import _ from 'lodash'
import path from 'path'
import { v4 as uuid } from 'uuid'
import { Assert } from '../../assert'
import { Logger } from '../../logger'
import { Meter } from '../../metrics/meter'
import { IronfishNode } from '../../node'
import { Note, Transaction } from '../../primitives'
import { NoteEncrypted } from '../../primitives/noteEncrypted'
import { IJsonSerializable } from '../../serde/Serde'
import {
  BufferEncoding,
  DatabaseSchema,
  DatabaseStoreValue,
  IDatabase,
  IDatabaseStore,
  IDatabaseTransaction,
  JsonEncoding,
  StringEncoding,
} from '../../storage'
import { createDB } from '../../storage/utils'
import { BenchUtils } from '../../utils'
import { Migration } from '../migration'
import { loadNewStores, NewStores } from './013-wallet-2/new/stores'
import { loadOldStores, OldStores } from './013-wallet-2/old/stores'

type Stores = {
  old: OldStores
  new: NewStores
}

export class Migration013 extends Migration {
  path = __filename

  prepare(node: IronfishNode): IDatabase {
    return createDB({ location: node.config.accountDatabasePath })
  }

  async forward(
    node: IronfishNode,
    db: IDatabase,
    tx: IDatabaseTransaction | undefined,
    logger: Logger,
  ): Promise<void> {
    const startTotal = BenchUtils.startSegment()
    let start = BenchUtils.startSegment()

    const chainDb = createDB({ location: node.config.chainDatabasePath })
    await chainDb.open()

    const stores: Stores = {
      old: loadOldStores(db, chainDb),
      new: loadNewStores(db),
    }

    const cacheDbPath = path.join(node.config.tempDir, 'migration')
    await node.files.mkdir(cacheDbPath, { recursive: true })
    const cacheDb = createDB({ location: cacheDbPath })
    logger.debug(`Using cache database at ${cacheDbPath}`)

    const cacheMeta: IDatabaseStore<DatabaseSchema<string, IJsonSerializable>> =
      cacheDb.addStore({
        name: 'm',
        keyEncoding: new StringEncoding(),
        valueEncoding: new JsonEncoding(),
      })

    const noteToTransactionCache: IDatabaseStore<DatabaseSchema<Buffer, Buffer>> =
      cacheDb.addStore({
        name: 'z',
        keyEncoding: new BufferEncoding(),
        valueEncoding: new BufferEncoding(),
      })

    const transactionsCache: IDatabaseStore<
      DatabaseSchema<Buffer, DatabaseStoreValue<Stores['new']['transactions']>>
    > = cacheDb.addStore({
      name: 'cz',
      keyEncoding: new BufferEncoding(),
      valueEncoding: stores.new.transactions.valueEncoding,
    })

    logger.debug('Opening Cache DB connection')
    await cacheDb.open()

    if ((await cacheMeta.get('noteToTransactionCache')) !== true) {
      logger.debug('Building note to transaction cache')
      start = BenchUtils.startSegment()
      await this.writeNoteToTransactionCache(stores, cacheDb, noteToTransactionCache, logger)
      logger.debug('\t' + BenchUtils.renderSegment(BenchUtils.endSegment(start)))
      await cacheMeta.put('noteToTransactionCache', true)
    } else {
      logger.debug('Skipping note to transaction cache')
    }

    if ((await cacheMeta.get('transactionsCache')) !== true) {
      logger.debug('Building transaction cache')
      start = BenchUtils.startSegment()
      await this.writeTransactionsCache(stores, transactionsCache, logger)
      logger.debug('\t' + BenchUtils.renderSegment(BenchUtils.endSegment(start)))
      await cacheMeta.put('transactionsCache', true)
    } else {
      logger.debug('Skipping transaction cache')
    }

    logger.debug('Migrating: accounts')
    start = BenchUtils.startSegment()
    await this.migrateAccounts(stores, db, logger, tx)
    logger.debug('\t' + BenchUtils.renderSegment(BenchUtils.endSegment(start)))

    logger.debug('Migrating: accounts data')
    start = BenchUtils.startSegment()
    await this.migrateAccountsData(
      stores,
      db,
      noteToTransactionCache,
      transactionsCache,
      cacheMeta,
      logger,
      tx,
    )
    logger.debug('\t' + BenchUtils.renderSegment(BenchUtils.endSegment(start)))

    logger.debug('Migrating: headHashes')
    start = BenchUtils.startSegment()
    await this.migrateHeadHashes(stores, logger, tx)
    logger.debug('\t' + BenchUtils.renderSegment(BenchUtils.endSegment(start)))

    logger.debug('Migrating: meta')
    start = BenchUtils.startSegment()
    await this.migrateMeta(stores, db, logger, tx)
    logger.debug('\t' + BenchUtils.renderSegment(BenchUtils.endSegment(start)))

    logger.debug('Migrating: Deleting old stores')
    await this.deleteOldStores(stores, logger, tx)

    logger.debug('Migrating: Checking nullifierToNote')
    start = BenchUtils.startSegment()
    await this.checkNullifierToNote(stores, node, logger, tx)
    logger.debug('\t' + BenchUtils.renderSegment(BenchUtils.endSegment(start)))

    await chainDb.close()
    await cacheDb.close()

    logger.debug(`Migrating: Deleting cache DB at ${cacheDbPath}`)
    start = BenchUtils.startSegment()
    await fsAsync.rm(cacheDbPath, { force: true, recursive: true })
    logger.debug('\t' + BenchUtils.renderSegment(BenchUtils.endSegment(start)))

    logger.debug(BenchUtils.renderSegment(BenchUtils.endSegment(startTotal)))
  }

  backward(): Promise<void> {
    throw new Error()
  }

  async migrateHeadHashes(
    stores: Stores,
    logger: Logger,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    const headHashHex = await stores.old.meta.get('headHash', tx)
    const headHash = headHashHex ? Buffer.from(headHashHex, 'hex') : null

    for await (const account of stores.new.accounts.getAllValuesIter(tx)) {
      logger.debug(`\tSetting account ${account.name} head hash: ${headHashHex || 'null'}`)
      await stores.new.headHashes.put(account.id, headHash, tx)
    }
  }

  async migrateMeta(
    stores: Stores,
    walletDb: IDatabase,
    logger: Logger,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    const accountName = await stores.old.meta.get('defaultAccountName')
    const accounts = await stores.new.accounts.getAllValues(tx)

    await walletDb.withTransaction(tx, async (tx) => {
      if (accountName) {
        const account = accounts.find((a) => a.name === accountName)

        if (account) {
          logger.debug(`\tMigrating default account from ${accountName} -> ${account.id}`)
          await stores.new.meta.put('defaultAccountId', account.id, tx)
        } else {
          logger.warn(`\tCould not migrate default account with name ${accountName}`)
          await stores.new.meta.put('defaultAccountId', null, tx)
        }
      }

      await stores.old.meta.del('defaultAccountName', tx)
      await stores.old.meta.del('headHash', tx)
    })
  }

  async migrateAccounts(
    stores: Stores,
    walletDb: IDatabase,
    logger: Logger,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    let count = 0

    const accounts = await stores.old.accounts.getAll(tx)

    for (const [accountName, accountValue] of accounts) {
      const migrated = {
        id: uuid(),
        ...accountValue,
      }

      await walletDb.withTransaction(tx, async (tx) => {
        await stores.new.accounts.put(migrated.id, migrated, tx)
        await stores.old.accounts.del(accountName, tx)
        await stores.new.balances.put(migrated.id, BigInt(0), tx)
      })

      count++
    }

    logger.debug(`\tMigrated ${count} accounts`)

    for await (const account of stores.new.accounts.getAllValuesIter(tx)) {
      logger.debug(
        `\tAccount: ${account.name} -> ${account.id}: ${calculateAccountPrefix(
          account.id,
        ).toString('hex')}`,
      )
    }
  }

  async migrateAccountsData(
    stores: Stores,
    walletDb: IDatabase,
    noteToTransaction: IDatabaseStore<DatabaseSchema<Buffer, Buffer>>,
    transactionsCache: IDatabaseStore<
      DatabaseSchema<Buffer, DatabaseStoreValue<Stores['new']['transactions']>>
    >,
    cacheMeta: IDatabaseStore<DatabaseSchema<string, IJsonSerializable>>,
    logger: Logger,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    let countMissingAccount = Number((await cacheMeta.get('countMissingAccount')) ?? 0)
    let countMissingTx = Number((await cacheMeta.get('countMissingTx')) ?? 0)
    let countNote = Number((await cacheMeta.get('countNote')) ?? 0)

    const accounts = await stores.new.accounts.getAllValues(tx)

    // Restore the current balances in case we have resumed the migration
    const unconfirmedBalances = new Map<string, bigint>()
    for await (const [accountId, balance] of stores.new.balances.getAllIter(tx)) {
      unconfirmedBalances.set(accountId, balance)
    }

    // Cache the account prefix because murmur is slow
    const accountPrefixes = new Map<string, Buffer>()
    for (const account of accounts) {
      const prefix = calculateAccountPrefix(account.id)
      accountPrefixes.set(account.id, prefix)
    }

    const speed = new Meter()
    speed.start()

    for await (const [noteHashHex, nullifierEntry] of stores.old.noteToNullifier.getAllIter(
      tx,
    )) {
      const noteHash = Buffer.from(noteHashHex, 'hex')
      const transactionHash = await noteToTransaction.get(noteHash)

      if (!transactionHash) {
        countMissingTx++
        speed.add(1)
        continue
      }

      const transaction = await transactionsCache.get(transactionHash)

      if (!transaction) {
        countMissingTx++
        speed.add(1)
        continue
      }

      const encryptedNote = findNoteInTransaction(transaction.transaction, noteHash)
      Assert.isNotNull(encryptedNote)

      let ownerAccount: DatabaseStoreValue<Stores['new']['accounts']> | null = null
      let ownerNote: Note | null = null

      for (const possibleAccount of accounts) {
        const received = encryptedNote.decryptNoteForOwner(possibleAccount.incomingViewKey)

        if (received) {
          ownerAccount = possibleAccount
          ownerNote = received
          break
        }
      }

      if (!ownerAccount || !ownerNote) {
        logger.warn(
          `\tCould not find the original account that the note ${noteHashHex} was decrypted as owner, discarding. Tried ${accounts.length} accounts.`,
        )
        countMissingAccount++
        speed.add(1)
        continue
      }

      const decryptedNote = {
        accountId: ownerAccount.id,
        index: nullifierEntry.noteIndex,
        note: ownerNote,
        spent: nullifierEntry.spent,
        transactionHash: transactionHash,
        nullifier: nullifierEntry.nullifierHash
          ? Buffer.from(nullifierEntry.nullifierHash, 'hex')
          : null,
      }

      const accountPrefix = accountPrefixes.get(ownerAccount.id)
      Assert.isNotUndefined(accountPrefix)

      // These writes must happen atomically
      await walletDb.withTransaction(tx, async (tx) => {
        Assert.isNotNull(ownerAccount)
        Assert.isNotNull(ownerNote)

        await stores.new.decryptedNotes.put([accountPrefix, noteHash], decryptedNote, tx)
        await stores.new.transactions.put([accountPrefix, transactionHash], transaction, tx)

        if (!decryptedNote.spent) {
          let balance = unconfirmedBalances.get(ownerAccount.id) ?? BigInt(0)
          balance += ownerNote.value()
          unconfirmedBalances.set(ownerAccount.id, balance)
          await stores.new.balances.put(ownerAccount.id, balance, tx)
        }

        if (decryptedNote.nullifier) {
          await stores.new.nullifierToNoteHash.put(
            [accountPrefix, decryptedNote.nullifier],
            noteHash,
            tx,
          )
        }

        // Delete note from old store so that it will not be reprocessed if we resume the migration
        await stores.old.noteToNullifier.del(noteHashHex, tx)

        if (transaction.sequence) {
          await stores.new.sequenceToNoteHash.put(
            [accountPrefix, [transaction.sequence, noteHash]],
            null,
            tx,
          )
        } else {
          await stores.new.nonChainNoteHashes.put([accountPrefix, noteHash], null, tx)
          await stores.new.pendingTransactionHashes.put(
            [accountPrefix, [transaction.transaction.expirationSequence(), transactionHash]],
            null,
            tx,
          )
        }
      })

      countNote++
      speed.add(1)

      if (countNote % 1000 === 0) {
        await cacheMeta.put('countMissingAccount', countMissingAccount)
        await cacheMeta.put('countMissingTx', countMissingTx)
        await cacheMeta.put('countNote', countNote)
        logger.debug(`Migrated ${countNote} notes: ${speed.rate1s.toFixed(2)}/s`)
      }
    }

    speed.stop()
    logger.debug(`\tMigrated ${countNote}~ notes.`)

    if (countMissingAccount) {
      logger.warn(`\tDropped ${countMissingAccount}~ notes missing accounts.`)
    }

    if (countMissingTx) {
      logger.warn(`\tDropped ${countMissingTx}~ missing transactions.`)
    }

    for (const account of accounts) {
      const balance = unconfirmedBalances.get(account.id)

      if (typeof balance === 'bigint') {
        logger.debug(`\tCalculated balance ${account.name}: ${balance}`)
      } else {
        logger.debug(`\tNo balance for ${account.name}, setting to 0`)
      }
    }
  }

  async writeTransactionsCache(
    stores: Stores,
    transactionsCache: IDatabaseStore<
      DatabaseSchema<Buffer, DatabaseStoreValue<Stores['new']['transactions']>>
    >,
    logger: Logger,
  ): Promise<void> {
    let countMigrated = 0
    let countDropped = 0

    for await (const [
      transactionHash,
      transactionValue,
    ] of stores.old.transactions.getAllIter()) {
      const migrated = {
        ...transactionValue,
        transaction: new Transaction(transactionValue.transaction),
        blockHash: null as null | Buffer,
        sequence: null as null | number,
      }

      if (transactionValue.blockHash) {
        const blockHash = Buffer.from(transactionValue.blockHash, 'hex')
        const header = await stores.old.headers.get(blockHash)

        if (!header) {
          logger.debug(
            `\tDropping TX ${transactionHash.toString('hex')}: block not found ${
              transactionValue.blockHash
            }`,
          )

          countDropped++
          continue
        }

        migrated.blockHash = blockHash
        migrated.sequence = header.header.sequence
      }

      await transactionsCache.put(transactionHash, migrated)
      countMigrated++
    }

    logger.debug(`Migrated ${countMigrated} transactions and dropped ${countDropped}`)
  }

  async writeNoteToTransactionCache(
    stores: Stores,
    cacheDb: IDatabase,
    noteToTransactionCache: IDatabaseStore<DatabaseSchema<Buffer, Buffer>>,
    logger: Logger,
  ): Promise<void> {
    let countTransaction = 0
    let countNote = 0

    const batch = cacheDb.batch()
    const batchSize = 1000

    for await (const [
      transactionHash,
      transactionValue,
    ] of stores.old.transactions.getAllIter()) {
      const transaction = new Transaction(transactionValue.transaction)

      for (const note of transaction.notes()) {
        const noteHash = note.merkleHash()

        batch.put(noteToTransactionCache, noteHash, transactionHash)
        countNote++

        if (batch.size >= batchSize) {
          await batch.commit()
        }
      }

      countTransaction++
    }

    await batch.commit()
    logger.debug(`\tFound ${countNote} notes that map to ${countTransaction} transactions`)
  }

  async deleteOldStores(
    stores: Stores,
    logger: Logger,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    let start = BenchUtils.startSegment()
    await stores.old.nullifierToNote.clear(tx)
    logger.debug('\tnullifierToNote: ' + BenchUtils.renderSegment(BenchUtils.endSegment(start)))

    start = BenchUtils.startSegment()
    await stores.old.accounts.clear(tx)
    logger.debug('\taccounts: ' + BenchUtils.renderSegment(BenchUtils.endSegment(start)))

    start = BenchUtils.startSegment()
    await stores.old.meta.clear(tx)
    logger.debug('\tmeta: ' + BenchUtils.renderSegment(BenchUtils.endSegment(start)))

    start = BenchUtils.startSegment()
    await stores.old.noteToNullifier.clear(tx)
    logger.debug('\tnoteToNullifier: ' + BenchUtils.renderSegment(BenchUtils.endSegment(start)))

    start = BenchUtils.startSegment()
    await stores.old.transactions.clear(tx)
    logger.debug('\ttransactions: ' + BenchUtils.renderSegment(BenchUtils.endSegment(start)))
  }

  private async checkNullifierToNote(
    stores: Stores,
    node: IronfishNode,
    logger: Logger,
    tx?: IDatabaseTransaction,
  ) {
    for await (const [
      [accountPrefix, nullifier],
      noteHash,
    ] of stores.new.nullifierToNoteHash.getAllIter(tx)) {
      const hasNote = await stores.new.decryptedNotes.has([accountPrefix, noteHash], tx)

      if (!hasNote) {
        logger.debug(
          `Missing nullifier ${nullifier.toString('hex')} -> ${noteHash.toString(
            'hex',
          )} (${accountPrefix.toString('hex')})`,
        )

        throw new Error(
          `Your wallet is corrupt and missing a note for a nullifier.` +
            ` If you have backed up your accounts, you should delete your accounts database at ${node.config.accountDatabasePath} and run this again.`,
        )
      }
    }
  }
}

function findNoteInTransaction(
  transaction: Transaction,
  noteHash: Buffer,
): NoteEncrypted | null {
  for (const note of transaction.notes()) {
    if (note.merkleHash().equals(noteHash)) {
      return note
    }
  }

  return null
}

export function calculateAccountPrefix(id: string): Buffer {
  const prefix = Buffer.alloc(4)
  const prefixHash = new MurmurHash3(id, 1).result()
  prefix.writeUInt32BE(prefixHash)
  return prefix
}
