/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import LRU from 'blru'
import { BufferMap, BufferSet } from 'buffer-map'
import fsAsync from 'fs/promises'
import MurmurHash3 from 'imurmurhash'
import path from 'path'
import { v4 as uuid } from 'uuid'
import { Assert } from '../../assert'
import { Logger } from '../../logger'
import { ConsoleReporter } from '../../logger/reporters'
import { IronfishNode } from '../../node'
import { Transaction } from '../../primitives'
import { NoteEncrypted } from '../../primitives/noteEncrypted'
import {
  BufferEncoding,
  DatabaseSchema,
  DatabaseStoreValue,
  IDatabase,
  IDatabaseStore,
  IDatabaseTransaction,
} from '../../storage'
import { createDB } from '../../storage/utils'
import { isTransactionMine } from '../../testUtilities/helpers/transaction'
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
    return createDB({ location: node.accounts.db.location })
  }

  async forward(
    node: IronfishNode,
    db: IDatabase,
    tx: IDatabaseTransaction,
    logger: Logger,
  ): Promise<void> {
    const startTotal = BenchUtils.startSegment()

    const chainDb = createDB({ location: node.config.chainDatabasePath })
    await chainDb.open()

    const cacheDbPath = path.join(node.config.tempDir, 'migration')

    const cacheDb = createDB({ location: cacheDbPath })

    logger.debug(`Using cache database at ${cacheDbPath}`)

    const noteToTransaction: IDatabaseStore<DatabaseSchema<Buffer, Buffer>> = cacheDb.addStore({
      name: 'z',
      keyEncoding: new BufferEncoding(),
      valueEncoding: new BufferEncoding(),
    })

    const stores: Stores = {
      old: loadOldStores(db, chainDb),
      new: loadNewStores(db),
    }

    logger.debug('Clearing old note to transaction cache')
    let start = BenchUtils.startSegment()
    await fsAsync.rm(cacheDbPath, { force: true, recursive: true })
    logger.debug('\t' + BenchUtils.renderSegment(BenchUtils.endSegment(start)))

    await cacheDb.open()

    logger.debug('Building note to transaction cache')
    start = BenchUtils.startSegment()
    await this.writeNoteToTransactionCache(stores, cacheDb, noteToTransaction, logger)
    logger.debug('\t' + BenchUtils.renderSegment(BenchUtils.endSegment(start)))

    logger.debug('Migrating: accounts')
    start = BenchUtils.startSegment()
    const accounts = await this.migrateAccounts(stores, tx, logger)
    logger.debug('\t' + BenchUtils.renderSegment(BenchUtils.endSegment(start)))

    logger.debug('Migrating: accounts data')
    start = BenchUtils.startSegment()
    await this.migrateAccountsData(stores, accounts, noteToTransaction, tx, logger)
    logger.debug('\t' + BenchUtils.renderSegment(BenchUtils.endSegment(start)))

    if (Math.random() > 0) {
      throw new Error()
    }

    logger.debug('Migrating: headHashes')
    start = BenchUtils.startSegment()
    await this.migrateHeadHashes(stores, accounts, tx, logger)
    logger.debug('\t' + BenchUtils.renderSegment(BenchUtils.endSegment(start)))

    logger.debug('Migrating: meta')
    start = BenchUtils.startSegment()
    await this.migrateMeta(stores, accounts, tx, logger)
    logger.debug('\t' + BenchUtils.renderSegment(BenchUtils.endSegment(start)))

    logger.debug('Migrating: Deleting old stores')
    await this.deleteOldStores(stores, tx, logger)

    logger.debug('Migrating: Checking nullifierToNote')
    start = BenchUtils.startSegment()
    await this.checkNullifierToNote(stores, node, tx)
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
    accounts: DatabaseStoreValue<NewStores['accounts']>[],
    tx: IDatabaseTransaction,
    logger: Logger,
  ): Promise<void> {
    const headHashHex = await stores.old.meta.get('headHash', tx)
    const headHash = headHashHex ? Buffer.from(headHashHex, 'hex') : null

    for (const account of accounts) {
      logger.debug(`\tSetting account ${account.name} head hash: ${String(headHash)}`)
      await stores.new.headHashes.put(account.id, headHash, tx)
    }
  }

  async migrateMeta(
    stores: Stores,
    accounts: DatabaseStoreValue<NewStores['accounts']>[],
    tx: IDatabaseTransaction,
    logger: Logger,
  ): Promise<void> {
    const accountName = await stores.old.meta.get('defaultAccountName')

    if (accountName) {
      const account = accounts.find((a) => a.name === accountName)

      if (account) {
        logger.debug(`\tMigrating default account from ${accountName} -> ${account.id}`)
        await stores.new.meta.put('defaultAccountId', account.id, tx)
      } else {
        logger.warn(`\tCould not migrate default with name ${accountName}`)
        await stores.new.meta.put('defaultAccountId', null, tx)
      }
    }

    await stores.old.meta.del('defaultAccountName', tx)
    await stores.old.meta.del('headHash', tx)
  }

  async migrateAccounts(
    stores: Stores,
    tx: IDatabaseTransaction,
    logger: Logger,
  ): Promise<DatabaseStoreValue<NewStores['accounts']>[]> {
    const accounts = []

    for await (const [accountName, accountValue] of stores.old.accounts.getAllIter(tx)) {
      const accountId = uuid()

      const migrated = {
        ...accountValue,
        id: accountId,
      }

      logger.debug(`\tAssigned account id ${accountName}: ${accountId}`)

      await stores.new.accounts.put(accountId, migrated, tx)
      await stores.old.accounts.del(accountName, tx)

      accounts.push(migrated)
    }

    logger.debug(`\tMigrated ${accounts.length} accounts`)

    return accounts
  }

  async migrateAccountsData(
    stores: Stores,
    accounts: DatabaseStoreValue<NewStores['accounts']>[],
    noteToTransaction: IDatabaseStore<DatabaseSchema<Buffer, Buffer>>,
    tx: IDatabaseTransaction,
    logger: Logger,
  ): Promise<void> {
    // let countMissingAccount = 0
    // let countDroppedTx = 0
    // let countNotes = 0

    // const unconfirmedBalances = new Map<string, bigint>()
    // const accountIdToPrefix = new Map<string, Buffer>()
    // const droppedTransactions = new BufferSet()

    // const transactionLRU = new LRU<
    //   Buffer,
    //   {
    //     transaction: DatabaseStoreValue<typeof stores.new.transactions> | null
    //     dropped: boolean
    //   }
    // >(1000, undefined, BufferMap)

    let countTransactions = 0
    let countNotes = 0
    let countSpends = 0

    for await (const [transactionHash, transactionValue] of stores.old.transactions.getAllIter(
      tx,
    )) {
      const transaction = new Transaction(transactionValue.transaction)
      countTransactions++
      countNotes += transaction.notesLength()
      countSpends += transaction.spendsLength()
    }

    console.log(countTransactions)
    console.log(countNotes)
    console.log(countSpends)






    for await (const [noteHashHex, nullifierEntry] of stores.old.noteToNullifier.getAllIter(
      tx,
    )) {
      const noteHash = Buffer.from(noteHashHex, 'hex')

      const transactionHash = await noteToTransaction.get(noteHash)
      Assert.isNotUndefined(
        transactionHash,
        `Could not find note ${noteHashHex} in noteHashToTransaction`,
      )

      if (droppedTransactions.has(transactionHash)) {
        countDroppedTx++
        continue
      }


      const { transaction, dropped } = await this.constructMigratedTransaction(
        stores,
        transactionHash,
        tx,
        logger,
      )

      if (dropped) {
        countDroppedTx++
        droppedTransactions.add(transactionHash)
        continue
      }

      Assert.isNotNull(transaction)

      const encryptedNote = findNoteInTranaction(transaction.transaction, noteHash)
      Assert.isNotNull(
        encryptedNote,
        `Could not find note ${noteHashHex} in transaction ${transactionHash.toString('hex')}`,
      )

      let account = null
      let note = null

      for (const possibleAccount of accounts) {
        const received = encryptedNote.decryptNoteForOwner(possibleAccount.incomingViewKey)

        if (received) {
          note = received
          account = possibleAccount
          break
        }
      }

      if (!account || !note) {
        logger.warn(
          `\tCould not find the original account that the note ${noteHashHex} was decrypted as owner, discarding. Tried ${accounts.length} accounts.`,
        )
        countMissingAccount++
        continue
      }

      const nullifierHash = nullifierEntry.nullifierHash
        ? Buffer.from(nullifierEntry.nullifierHash, 'hex')
        : null

      const decryptedNote: DatabaseStoreValue<NewStores['decryptedNotes']> = {
        accountId: account.id,
        noteIndex: nullifierEntry.noteIndex,
        serializedNote: note.serialize(),
        spent: nullifierEntry.spent,
        transactionHash: transactionHash,
        nullifierHash: nullifierHash,
      }

      if (!decryptedNote.spent) {
        let balance = unconfirmedBalances.get(account.id) ?? BigInt(0)
        balance += note.value()
        unconfirmedBalances.set(account.id, balance)
      }

      // Cache the account prefix because murmur is slow
      let accountPrefix = accountIdToPrefix.get(account.id)
      if (!accountPrefix) {
        accountPrefix = calculateAccountPrefix(account.id)
        accountIdToPrefix.set(account.id, accountPrefix)
      }

      // Write the account data
      await stores.new.decryptedNotes.put([accountPrefix, noteHash], decryptedNote, tx)
      await stores.new.transactions.put([accountPrefix, transactionHash], transaction, tx)

      if (decryptedNote.nullifierHash) {
        await stores.new.nullifierToNoteHash.put(
          [accountPrefix, decryptedNote.nullifierHash],
          noteHash,
        )
      }

      countNotes++
      console.log(countNotes)
    }

    logger.debug(`\tMigrated ${countNotes} notes.`)

    if (countMissingAccount) {
      logger.warn(
        `\tDropped ${countMissingAccount} notes that were not decryptable by any accounts we have and dropped ${countDroppedTx} notes from transactions that were dropped because their blocks were missing.`,
      )
    }

    if (countDroppedTx) {
      logger.warn(
        `\tDropped ${countDroppedTx} notes from TX that were dropped because their blocks were missing.`,
      )
    }

    for (const account of accounts) {
      const balance = unconfirmedBalances.get(account.id)

      if (typeof balance === 'bigint') {
        logger.debug(`\tCalculated balance ${account.name}: ${balance}`)
        await stores.new.balances.put(account.id, balance, tx)
      } else {
        logger.debug(`\tNo balance for ${account.name}, setting to 0`)
        await stores.new.balances.put(account.id, BigInt(0), tx)
      }
    }
  }

  async constructMigratedTransaction(
    stores: Stores,
    transactionHash: Buffer,
    tx: IDatabaseTransaction,
    logger: Logger,
  ): Promise<{
    transaction: DatabaseStoreValue<typeof stores.new.transactions> | null
    dropped: boolean
  }> {
    const oldValue = await stores.old.transactions.get(transactionHash, tx)
    Assert.isNotUndefined(oldValue)

    const migrated: DatabaseStoreValue<typeof stores.new.transactions> = {
      ...oldValue,
      transaction: new Transaction(oldValue.transaction),
      blockHash: null,
      sequence: null,
    }

    if (oldValue.blockHash) {
      const blockHash = Buffer.from(oldValue.blockHash, 'hex')
      const header = await stores.old.headers.get(blockHash)

      if (!header) {
        logger.debug(
          `\tDropping TX ${transactionHash.toString('hex')}: block not found ${
            oldValue.blockHash
          }`,
        )

        return {
          transaction: null,
          dropped: true,
        }
      }

      migrated.blockHash = blockHash
      migrated.sequence = header.header.sequence
    }

    return {
      transaction: migrated,
      dropped: false,
    }
  }

  async writeNoteToTransactionCache(
    stores: Stores,
    cacheDb: IDatabase,
    noteToTransaction: IDatabaseStore<DatabaseSchema<Buffer, Buffer>>,
    logger: Logger,
  ): Promise<void> {
    let transactionCount = 0
    let noteCount = 0
    const spendCount = 0

    const batch = cacheDb.batch()
    const batchSize = 1000

    for await (const [
      transactionHash,
      transactionValue,
    ] of stores.old.transactions.getAllIter()) {
      const transaction = new Transaction(transactionValue.transaction)

      for (const note of transaction.notes()) {
        const noteHash = note.merkleHash()

        batch.put(noteToTransaction, noteHash, transactionHash)
        noteCount++

        if (batch.size >= batchSize) {
          await batch.commit()
        }
      }

      transactionCount++
    }

    await batch.commit()
    logger.debug(
      `\tFound ${noteCount} notes and ${spendCount} spends that map to ${transactionCount} transactions`,
    )
  }

  async deleteOldStores(
    stores: Stores,
    tx: IDatabaseTransaction,
    logger: Logger,
  ): Promise<void> {
    let start = BenchUtils.startSegment()
    await stores.old.nullifierToNote.clear(tx)
    logger.debug('\tnullifierToNote' + BenchUtils.renderSegment(BenchUtils.endSegment(start)))

    start = BenchUtils.startSegment()
    await stores.old.accounts.clear(tx)
    logger.debug('\taccounts' + BenchUtils.renderSegment(BenchUtils.endSegment(start)))

    start = BenchUtils.startSegment()
    await stores.old.meta.clear(tx)
    logger.debug('\tmeta' + BenchUtils.renderSegment(BenchUtils.endSegment(start)))

    start = BenchUtils.startSegment()
    await stores.old.noteToNullifier.clear(tx)
    logger.debug('\tnoteToNullifier' + BenchUtils.renderSegment(BenchUtils.endSegment(start)))

    start = BenchUtils.startSegment()
    await stores.old.transactions.clear(tx)
    logger.debug('\ttransactions' + BenchUtils.renderSegment(BenchUtils.endSegment(start)))
  }

  private async checkNullifierToNote(
    stores: Stores,
    node: IronfishNode,
    tx: IDatabaseTransaction,
  ) {
    let missing = 0

    for await (const [
      [accountPrefix, _],
      noteHash,
    ] of stores.new.nullifierToNoteHash.getAllIter(tx)) {
      const hasNote = await stores.new.decryptedNotes.has([accountPrefix, noteHash], tx)

      if (!hasNote) {
        missing++
      }
    }

    if (missing) {
      throw new Error(
        `Your wallet is corrupt and missing ${missing} notes for nullifiers.` +
          ` If you have backed up your accounts, you should delete your accounts database at ${node.accounts.db.location} and run this again.`,
      )
    }
  }
}

function findNoteInTranaction(
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
