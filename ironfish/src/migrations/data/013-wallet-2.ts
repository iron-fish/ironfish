/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { BufferMap } from 'buffer-map'
import { v4 as uuid } from 'uuid'
import { Assert } from '../../assert'
import { Logger } from '../../logger'
import { IronfishNode } from '../../node'
import { Transaction } from '../../primitives'
import { NoteEncrypted } from '../../primitives/noteEncrypted'
import { DatabaseStoreValue, IDatabase, IDatabaseTransaction } from '../../storage'
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

    const stores: Stores = {
      old: loadOldStores(db, chainDb),
      new: loadNewStores(db),
    }

    logger.debug('Building a map of notes to which transaction they are in')
    let start = BenchUtils.startSegment()
    const noteToTransactionCache = await this.buildNoteToTransactionCache(
      stores.old.transactions,
      tx,
      logger,
    )
    logger.debug('\t' + BenchUtils.renderSegment(BenchUtils.endSegment(start)))

    logger.debug('Migrating: accounts')
    start = BenchUtils.startSegment()
    const accounts = await this.migrateAccounts(
      stores.old.accounts,
      stores.new.accounts,
      tx,
      logger,
    )
    logger.debug('\t' + BenchUtils.renderSegment(BenchUtils.endSegment(start)))

    logger.debug('Migrating: transactions')
    start = BenchUtils.startSegment()
    const droppedTransactions = await this.migrateTransactions(
      stores.old.transactions,
      stores.new.transactions,
      stores.old.headers,
      tx,
      logger,
    )
    logger.debug('\t' + BenchUtils.renderSegment(BenchUtils.endSegment(start)))

    logger.debug('Migrating: decryptedNotes')
    start = BenchUtils.startSegment()
    const { unconfirmedBalances } = await this.migrateDecryptedNotes(
      stores.old.noteToNullifier,
      stores.new.transactions,
      stores.new.decryptedNotes,
      noteToTransactionCache,
      accounts,
      droppedTransactions,
      tx,
      logger,
    )
    logger.debug('\t' + BenchUtils.renderSegment(BenchUtils.endSegment(start)))

    logger.debug('Migrating: balances')
    start = BenchUtils.startSegment()
    await this.migrateBalances(stores.new.balances, unconfirmedBalances, accounts, tx, logger)
    logger.debug('\t' + BenchUtils.renderSegment(BenchUtils.endSegment(start)))

    logger.debug('Migrating: nullifierToNoteHash')
    start = BenchUtils.startSegment()
    await this.migrateNullifierToNoteHash(
      stores.old.nullifierToNote,
      stores.new.nullifierToNoteHash,
      tx,
      logger,
    )
    logger.debug('\t' + BenchUtils.renderSegment(BenchUtils.endSegment(start)))

    logger.debug('Migrating: headHashes')
    start = BenchUtils.startSegment()
    await this.migrateHeadHashes(stores.old.meta, stores.new.headHashes, accounts, tx, logger)
    logger.debug('\t' + BenchUtils.renderSegment(BenchUtils.endSegment(start)))

    logger.debug('Migrating: meta')
    start = BenchUtils.startSegment()
    await this.migrateMeta(stores.old.meta, stores.new.meta, accounts, tx, logger)
    logger.debug('\t' + BenchUtils.renderSegment(BenchUtils.endSegment(start)))

    logger.debug('Migrating: Deleting old store nullifierToNote')
    start = BenchUtils.startSegment()
    await stores.old.nullifierToNote.clear(tx)
    logger.debug('\t' + BenchUtils.renderSegment(BenchUtils.endSegment(start)))

    logger.debug('Migrating: Deleting old store noteToNullifier')
    start = BenchUtils.startSegment()
    await stores.old.noteToNullifier.clear(tx)
    logger.debug('\t' + BenchUtils.renderSegment(BenchUtils.endSegment(start)))

    await chainDb.close()
    logger.debug(BenchUtils.renderSegment(BenchUtils.endSegment(startTotal)))
  }

  backward(): Promise<void> {
    throw new Error()
  }

  async buildNoteToTransactionCache(
    transactionsStoreOld: Stores['old']['transactions'],
    tx: IDatabaseTransaction,
    logger: Logger,
  ): Promise<BufferMap<Buffer>> {
    const noteToTransaction = new BufferMap<Buffer>()
    let tranactionCount = 0

    for await (const [transactionHash, transactionValue] of transactionsStoreOld.getAllIter(
      tx,
    )) {
      const transaction = new Transaction(transactionValue.transaction)

      for (const note of transaction.notes()) {
        const noteHash = note.merkleHash()
        noteToTransaction.set(noteHash, transactionHash)
      }

      tranactionCount++
    }

    logger.debug(
      `\tFound ${noteToTransaction.size} notes that map to ${tranactionCount} transactions`,
    )

    return noteToTransaction
  }

  async migrateBalances(
    balancesStoreNew: Stores['new']['balances'],
    unconfirmedBalances: Map<string, bigint>,
    accounts: { account: DatabaseStoreValue<NewStores['accounts']>; id: string }[],
    tx: IDatabaseTransaction,
    logger: Logger,
  ): Promise<void> {
    for (const account of accounts) {
      const balance = unconfirmedBalances.get(account.id)

      if (typeof balance === 'bigint') {
        logger.debug(`\tCalculated balance ${account.account.name}: ${balance}`)
        await balancesStoreNew.put(account.id, balance, tx)
      } else {
        logger.debug(`\tNo balance for ${account.account.name}, setting to 0`)
        await balancesStoreNew.put(account.id, BigInt(0), tx)
      }
    }
  }

  async migrateNullifierToNoteHash(
    nullifierToNoteOld: Stores['old']['nullifierToNote'],
    nullifierToNoteHashNew: Stores['new']['nullifierToNoteHash'],
    tx: IDatabaseTransaction,
    logger: Logger,
  ): Promise<void> {
    let count = 0

    for await (const [nullifier, noteHash] of nullifierToNoteOld.getAllIter(tx)) {
      await nullifierToNoteHashNew.put(nullifier, noteHash, tx)
      count++
    }

    logger.debug(`\tMigrated ${count} nullifiers`)
  }

  async migrateHeadHashes(
    metaStoreOld: Stores['old']['meta'],
    headHashesStoreNew: Stores['new']['headHashes'],
    accounts: { account: DatabaseStoreValue<NewStores['accounts']>; id: string }[],
    tx: IDatabaseTransaction,
    logger: Logger,
  ): Promise<void> {
    const headHash = await metaStoreOld.get('headHash', tx)

    for (const account of accounts) {
      logger.debug(`\tSetting account ${account.account.name} head hash: ${String(headHash)}`)
      await headHashesStoreNew.put(account.id, headHash ?? null, tx)
    }
  }

  async migrateMeta(
    metaStoreOld: Stores['old']['meta'],
    metaStoreNew: Stores['new']['meta'],
    accounts: { account: DatabaseStoreValue<NewStores['accounts']>; id: string }[],
    tx: IDatabaseTransaction,
    logger: Logger,
  ): Promise<void> {
    const accountName = await metaStoreOld.get('defaultAccountName')

    if (accountName) {
      const account = accounts.find((a) => a.account.name === accountName)

      if (account) {
        logger.debug(`\tMigrating default account from ${accountName} -> ${account.id}`)
        await metaStoreNew.put('defaultAccountId', account.id, tx)
      } else {
        logger.warn(`\tCould not migrate default with name ${accountName}`)
        await metaStoreNew.put('defaultAccountId', null, tx)
      }
    }

    await metaStoreOld.del('defaultAccountName', tx)
    await metaStoreOld.del('headHash', tx)
  }

  async migrateAccounts(
    accountsStoreOld: Stores['old']['accounts'],
    accountsStoreNew: Stores['new']['accounts'],
    tx: IDatabaseTransaction,
    logger: Logger,
  ): Promise<{ account: DatabaseStoreValue<NewStores['accounts']>; id: string }[]> {
    const accounts = []

    for await (const [accountName, accountValue] of accountsStoreOld.getAllIter(tx)) {
      const accountId = uuid()

      logger.debug(`\tAssigned account id ${accountName}: ${accountId}`)

      await accountsStoreNew.put(accountId, accountValue, tx)
      await accountsStoreOld.del(accountName, tx)

      accounts.push({ id: accountId, account: accountValue })
    }

    logger.debug(`\tMigrated ${accounts.length} accounts`)

    return accounts
  }

  async migrateTransactions(
    transactionsStoreOld: Stores['old']['transactions'],
    transactionsStoreNew: Stores['new']['transactions'],
    headersStoreOld: Stores['old']['headers'],
    tx: IDatabaseTransaction,
    logger: Logger,
  ): Promise<BufferMap<true>> {
    const dropped = new BufferMap<true>()

    let countMigrated = 0
    let countDropped = 0

    for await (const [transactionHash, transactionValue] of transactionsStoreOld.getAllIter(
      tx,
    )) {
      const transactionHashHex = transactionHash.toString('hex')
      await transactionsStoreOld.del(transactionHash, tx)

      const migrated: DatabaseStoreValue<typeof transactionsStoreNew> = {
        ...transactionValue,
        sequence: null,
      }

      if (transactionValue.blockHash) {
        const blockHash = Buffer.from(transactionValue.blockHash, 'hex')
        const header = await headersStoreOld.get(blockHash)

        if (header) {
          migrated.sequence = header.header.sequence
          countMigrated++
        } else {
          logger.debug(
            `\tDropping TX ${transactionHashHex}: block not found ${transactionValue.blockHash}`,
          )
          await transactionsStoreOld.del(transactionHash, tx)
          dropped.set(transactionHash, true)
          countDropped++
          continue
        }
      }

      await transactionsStoreOld.del(transactionHash, tx)
      await transactionsStoreNew.put(transactionHash, migrated, tx)
    }

    logger.debug(`\tMigrated ${countMigrated} transactions`)

    if (countDropped) {
      logger.warn(`\tDropped ${countDropped} transactions with missing blocks`)
    }

    return dropped
  }

  async migrateDecryptedNotes(
    noteToNullifierStoreOld: Stores['old']['noteToNullifier'],
    transactionStoreNew: Stores['old']['transactions'],
    decryptedNoteStoreNew: Stores['new']['decryptedNotes'],
    noteToTransactionCache: BufferMap<Buffer>,
    accounts: { account: DatabaseStoreValue<NewStores['accounts']>; id: string }[],
    droppedTransactions: BufferMap<true>,
    tx: IDatabaseTransaction,
    logger: Logger,
  ): Promise<{ unconfirmedBalances: Map<string, bigint> }> {
    const decryptedNotes: DatabaseStoreValue<NewStores['decryptedNotes']>[] = []

    let countMissingAccount = 0
    let countMissingTx = 0

    const unconfirmedBalances = new Map<string, bigint>()

    for await (const [noteHashHex, nullifierEntry] of noteToNullifierStoreOld.getAllIter(tx)) {
      const noteHash = Buffer.from(noteHashHex, 'hex')

      const transactionHash = noteToTransactionCache.get(noteHash)
      Assert.isNotUndefined(transactionHash)

      if (droppedTransactions.has(transactionHash)) {
        countMissingTx++
        continue
      }

      const transactionEntry = await transactionStoreNew.get(transactionHash)
      Assert.isNotUndefined(transactionEntry)

      const transaction = new Transaction(transactionEntry.transaction)
      const encryptedNote = findNoteInTranaction(transaction, noteHashHex)

      if (!encryptedNote) {
        throw new Error(
          `Could not find note ${noteHashHex} in transaction ${transactionHash.toString(
            'hex',
          )}`,
        )
      }

      let account = null
      let note = null

      for (const accountWithId of accounts) {
        const received = encryptedNote.decryptNoteForOwner(
          accountWithId.account.incomingViewKey,
        )
        if (received) {
          note = received
          account = accountWithId
          break
        }

        const sent = encryptedNote.decryptNoteForSpender(accountWithId.account.outgoingViewKey)
        if (sent) {
          note = sent
          account = accountWithId
          break
        }
      }

      if (!account || !note) {
        logger.warn(
          `\tCould not find the original account that the note ${noteHashHex} was decrypted with, discarding. Tried ${accounts.length} accounts.`,
        )
        countMissingAccount++
        continue
      }

      const decryptedNote: DatabaseStoreValue<NewStores['decryptedNotes']> = {
        accountId: account.id,
        noteIndex: nullifierEntry.noteIndex,
        nullifierHash: nullifierEntry.nullifierHash,
        serializedNote: note.serialize(),
        spent: nullifierEntry.spent,
        transactionHash: transactionHash,
      }

      if (!decryptedNote.spent) {
        let balance = unconfirmedBalances.get(account.id) ?? BigInt(0)
        balance += note.value()
        unconfirmedBalances.set(account.id, balance)
      }

      await decryptedNoteStoreNew.put(noteHashHex, decryptedNote, tx)

      decryptedNotes.push(decryptedNote)
    }

    logger.debug(`\tMigrated ${decryptedNotes.length} notes.`)

    if (countMissingAccount) {
      logger.warn(
        `\tDropped ${countMissingAccount} notes that were not decryptable by any accounts we have and dropped ${countMissingTx} notes from transactions that were dropped because their blocks were missing.`,
      )
    }

    if (countMissingTx) {
      logger.warn(
        `\tDropped ${countMissingTx} notes from TX that were dropped because their blocks were missing.`,
      )
    }

    return { unconfirmedBalances }
  }
}

function findNoteInTranaction(
  transaction: Transaction,
  noteHash: string,
): NoteEncrypted | null {
  const noteHashBuffer = Buffer.from(noteHash, 'hex')

  for (const note of transaction.notes()) {
    if (note.merkleHash().equals(noteHashBuffer)) {
      return note
    }
  }

  return null
}
