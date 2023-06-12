/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import { BufferMap } from 'buffer-map'
import MurmurHash3 from 'imurmurhash'
import { Assert } from '../assert'
import { BlockHeader, Transaction } from '../primitives'
import { GENESIS_BLOCK_SEQUENCE } from '../primitives/block'
import { Note } from '../primitives/note'
import { DatabaseKeyRange, IDatabaseTransaction } from '../storage'
import { StorageUtils } from '../storage/database/utils'
import { WithNonNull } from '../utils'
import { DecryptedNote } from '../workerPool/tasks/decryptNotes'
import { AssetBalances } from './assetBalances'
import { AccountValue } from './walletdb/accountValue'
import { AssetValue } from './walletdb/assetValue'
import { BalanceValue } from './walletdb/balanceValue'
import { DecryptedNoteValue } from './walletdb/decryptedNoteValue'
import { HeadValue } from './walletdb/headValue'
import { TransactionValue } from './walletdb/transactionValue'
import { WalletDB } from './walletdb/walletdb'

export const ACCOUNT_KEY_LENGTH = 32

export const ACCOUNT_SCHEMA_VERSION = 2

export type SpendingAccount = WithNonNull<Account, 'spendingKey'>

export function isSpendingAccount(account: Account): account is SpendingAccount {
  return account.spendingKey !== null
}

export function AssertSpending(account: Account): asserts account is SpendingAccount {
  Assert.isNotNull(account.spendingKey)
}

export class Account {
  private readonly walletDb: WalletDB

  readonly id: string
  readonly displayName: string
  name: string
  readonly spendingKey: string | null
  readonly viewKey: string
  readonly incomingViewKey: string
  readonly outgoingViewKey: string
  readonly version: number
  publicAddress: string
  createdAt: HeadValue | null
  readonly prefix: Buffer
  readonly prefixRange: DatabaseKeyRange

  constructor({
    id,
    name,
    publicAddress,
    walletDb,
    spendingKey,
    viewKey,
    incomingViewKey,
    outgoingViewKey,
    version,
    createdAt,
  }: AccountValue & { walletDb: WalletDB }) {
    this.id = id
    this.name = name
    this.spendingKey = spendingKey
    this.viewKey = viewKey
    this.incomingViewKey = incomingViewKey
    this.outgoingViewKey = outgoingViewKey
    this.publicAddress = publicAddress

    this.prefix = calculateAccountPrefix(id)
    this.prefixRange = StorageUtils.getPrefixKeyRange(this.prefix)

    this.displayName = `${name} (${id.slice(0, 7)})`

    this.walletDb = walletDb
    this.version = version ?? 1
    this.createdAt = createdAt
  }

  serialize(): AccountValue {
    return {
      version: this.version,
      id: this.id,
      name: this.name,
      spendingKey: this.spendingKey,
      viewKey: this.viewKey,
      incomingViewKey: this.incomingViewKey,
      outgoingViewKey: this.outgoingViewKey,
      publicAddress: this.publicAddress,
      createdAt: this.createdAt,
    }
  }

  async *getNotes(
    keyRange?: DatabaseKeyRange,
  ): AsyncGenerator<DecryptedNoteValue & { hash: Buffer }> {
    for await (const decryptedNote of this.walletDb.loadDecryptedNotes(this, keyRange)) {
      yield decryptedNote
    }
  }

  async *getUnspentNotes(
    assetId: Buffer,
    options?: {
      confirmations?: number
    },
  ): AsyncGenerator<DecryptedNoteValue> {
    const head = await this.getHead()
    if (!head) {
      return
    }

    const confirmations = options?.confirmations ?? 0

    const maxConfirmedSequence = Math.max(head.sequence - confirmations, GENESIS_BLOCK_SEQUENCE)

    for await (const decryptedNote of this.walletDb.loadUnspentNotes(
      this,
      assetId,
      maxConfirmedSequence,
    )) {
      yield decryptedNote
    }
  }

  async getDecryptedNote(
    hash: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<DecryptedNoteValue | undefined> {
    return await this.walletDb.loadDecryptedNote(this, hash, tx)
  }

  async connectTransaction(
    blockHeader: BlockHeader,
    transaction: Transaction,
    decryptedNotes: Array<DecryptedNote>,
    tx?: IDatabaseTransaction,
  ): Promise<AssetBalances> {
    const blockHash = blockHeader.hash
    const sequence = blockHeader.sequence
    const assetBalanceDeltas = new AssetBalances()
    let submittedSequence = sequence
    let timestamp = blockHeader.timestamp

    await this.walletDb.db.withTransaction(tx, async (tx) => {
      let transactionValue = await this.getTransaction(transaction.hash(), tx)
      if (transactionValue) {
        submittedSequence = transactionValue.submittedSequence
        timestamp = transactionValue.timestamp
      }

      for (const decryptedNote of decryptedNotes) {
        if (decryptedNote.forSpender) {
          continue
        }

        const pendingNote = await this.getDecryptedNote(decryptedNote.hash, tx)

        const spent = pendingNote?.spent ?? false

        const note = {
          accountId: this.id,
          note: new Note(decryptedNote.serializedNote),
          spent,
          transactionHash: transaction.hash(),
          nullifier: decryptedNote.nullifier,
          index: decryptedNote.index,
          blockHash,
          sequence,
        }

        assetBalanceDeltas.increment(note.note.assetId(), note.note.value())

        await this.walletDb.saveDecryptedNote(this, decryptedNote.hash, note, tx)

        if (!spent) {
          await this.walletDb.addUnspentNoteHash(this, decryptedNote.hash, note, tx)
        }
      }

      for (const spend of transaction.spends) {
        const spentNoteHash = await this.getNoteHash(spend.nullifier, tx)
        if (!spentNoteHash) {
          continue
        }

        const note = await this.getDecryptedNote(spentNoteHash, tx)

        Assert.isNotUndefined(note)

        assetBalanceDeltas.increment(note.note.assetId(), -note.note.value())

        const spentNote = { ...note, spent: true }
        await this.walletDb.saveDecryptedNote(this, spentNoteHash, spentNote, tx)
        await this.walletDb.saveNullifierToTransactionHash(
          this,
          spend.nullifier,
          transaction,
          tx,
        )

        await this.walletDb.deleteUnspentNoteHash(this, spentNoteHash, spentNote, tx)
      }

      // account did not receive or spend
      if (assetBalanceDeltas.size === 0) {
        return
      }

      transactionValue = {
        transaction,
        blockHash,
        sequence,
        submittedSequence,
        timestamp,
        assetBalanceDeltas,
      }

      await this.saveMintsToAssetsStore(transactionValue, tx)
      await this.saveConnectedBurnsToAssetsStore(transactionValue.transaction, tx)

      await this.walletDb.saveTransaction(this, transaction.hash(), transactionValue, tx)
    })

    return assetBalanceDeltas
  }

  async saveAssetFromChain(
    createdTransactionHash: Buffer,
    id: Buffer,
    metadata: Buffer,
    name: Buffer,
    nonce: number,
    owner: Buffer,
    blockHeader?: { hash: Buffer | null; sequence: number | null },
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    if (id.equals(Asset.nativeId())) {
      return
    }

    await this.walletDb.putAsset(
      this,
      id,
      {
        blockHash: blockHeader?.hash ?? null,
        createdTransactionHash,
        id,
        metadata,
        name,
        nonce,
        owner,
        sequence: blockHeader?.sequence ?? null,
        supply: null,
      },
      tx,
    )
  }

  async updateAssetWithBlockHeader(
    assetValue: AssetValue,
    blockHeader: { hash: Buffer; sequence: number },
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    // Don't update for the native asset or if previously confirmed
    if (assetValue.id.equals(Asset.nativeId()) || assetValue.blockHash) {
      return
    }

    await this.walletDb.putAsset(
      this,
      assetValue.id,
      {
        blockHash: blockHeader.hash,
        createdTransactionHash: assetValue.createdTransactionHash,
        id: assetValue.id,
        metadata: assetValue.metadata,
        name: assetValue.name,
        nonce: assetValue.nonce,
        owner: assetValue.owner,
        sequence: blockHeader.sequence,
        supply: assetValue.supply,
      },
      tx,
    )
  }

  async saveMintsToAssetsStore(
    { blockHash, sequence, transaction }: TransactionValue,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    for (const { asset, value } of transaction.mints) {
      // Only store the asset for the owner
      if (asset.owner().toString('hex') !== this.publicAddress) {
        continue
      }

      const existingAsset = await this.walletDb.getAsset(this, asset.id(), tx)

      let createdTransactionHash = transaction.hash()
      let supply = 0n

      // Adjust supply if this transaction is connected on a block.
      if (blockHash && sequence) {
        supply += value
      }

      // If the asset has been previously confirmed on a block, use the existing
      // block hash, created transaction hash, and sequence for the database
      // upsert. Adjust supply from the current record.
      if (existingAsset && existingAsset.blockHash && existingAsset.sequence) {
        Assert.isNotNull(existingAsset.supply, 'Supply should be non-null for asset')
        blockHash = existingAsset.blockHash
        createdTransactionHash = existingAsset.createdTransactionHash
        sequence = existingAsset.sequence
        supply += existingAsset.supply
      }

      await this.walletDb.putAsset(
        this,
        asset.id(),
        {
          blockHash,
          createdTransactionHash,
          id: asset.id(),
          metadata: asset.metadata(),
          name: asset.name(),
          nonce: asset.nonce(),
          owner: asset.owner(),
          sequence,
          supply,
        },
        tx,
      )
    }
  }

  async saveConnectedBurnsToAssetsStore(
    transaction: Transaction,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    for (const { assetId, value } of transaction.burns) {
      const existingAsset = await this.walletDb.getAsset(this, assetId, tx)
      if (!existingAsset) {
        continue
      }

      // Verify the owner matches before processing a burn since an account can
      // burn assets it does not own
      if (existingAsset.owner.toString('hex') !== this.publicAddress) {
        continue
      }

      Assert.isNotNull(existingAsset.supply, 'Supply should be non-null for asset')

      const supply = existingAsset.supply - value
      Assert.isTrue(supply >= 0n, 'Invalid burn value')

      await this.walletDb.putAsset(
        this,
        assetId,
        {
          blockHash: existingAsset.blockHash,
          createdTransactionHash: existingAsset.createdTransactionHash,
          id: existingAsset.id,
          metadata: existingAsset.metadata,
          name: existingAsset.name,
          nonce: existingAsset.nonce,
          owner: existingAsset.owner,
          sequence: existingAsset.sequence,
          supply,
        },
        tx,
      )
    }
  }

  private async deleteDisconnectedBurnsFromAssetsStore(
    transaction: Transaction,
    tx: IDatabaseTransaction,
  ): Promise<void> {
    for (const { assetId, value } of transaction.burns.slice().reverse()) {
      const existingAsset = await this.walletDb.getAsset(this, assetId, tx)
      if (!existingAsset) {
        continue
      }

      // Verify the owner matches before processing a burn since an account can
      // burn assets it does not own
      if (existingAsset.owner.toString('hex') !== this.publicAddress) {
        continue
      }

      Assert.isNotNull(existingAsset.supply, 'Supply should be non-null for asset')

      const existingSupply = existingAsset.supply
      const supply = existingSupply + value

      await this.walletDb.putAsset(
        this,
        assetId,
        {
          blockHash: existingAsset.blockHash,
          createdTransactionHash: existingAsset.createdTransactionHash,
          id: existingAsset.id,
          metadata: existingAsset.metadata,
          name: existingAsset.name,
          nonce: existingAsset.nonce,
          owner: existingAsset.owner,
          sequence: existingAsset.sequence,
          supply,
        },
        tx,
      )
    }
  }

  private async deleteDisconnectedMintsFromAssetsStore(
    blockHeader: BlockHeader,
    transaction: Transaction,
    tx: IDatabaseTransaction,
  ): Promise<void> {
    for (const { asset, value } of transaction.mints.slice().reverse()) {
      // Only update the mint for the owner
      if (asset.owner().toString('hex') !== this.publicAddress) {
        continue
      }

      const existingAsset = await this.walletDb.getAsset(this, asset.id(), tx)
      Assert.isNotUndefined(existingAsset)
      Assert.isNotNull(existingAsset.supply, 'Supply should be non-null for asset')

      const existingSupply = existingAsset.supply
      const supply = existingSupply - value
      Assert.isTrue(supply >= 0n)

      let blockHash = existingAsset.blockHash
      let sequence = existingAsset.sequence
      // Mark this asset as pending if the block hash matches the hash on the
      // disconnected header
      if (blockHash && blockHash.equals(blockHeader.hash)) {
        blockHash = null
        sequence = null
      }

      await this.walletDb.putAsset(
        this,
        asset.id(),
        {
          blockHash,
          createdTransactionHash: existingAsset.createdTransactionHash,
          id: asset.id(),
          metadata: asset.metadata(),
          name: asset.name(),
          nonce: asset.nonce(),
          owner: asset.owner(),
          sequence,
          supply,
        },
        tx,
      )
    }
  }

  async addPendingTransaction(
    transaction: Transaction,
    decryptedNotes: Array<DecryptedNote>,
    submittedSequence: number,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    const assetBalanceDeltas = new AssetBalances()

    await this.walletDb.db.withTransaction(tx, async (tx) => {
      if (await this.hasTransaction(transaction.hash(), tx)) {
        return
      }

      for (const decryptedNote of decryptedNotes) {
        if (decryptedNote.forSpender) {
          continue
        }

        const note = {
          accountId: this.id,
          note: new Note(decryptedNote.serializedNote),
          spent: false,
          transactionHash: transaction.hash(),
          nullifier: null,
          index: null,
          blockHash: null,
          sequence: null,
        }

        assetBalanceDeltas.increment(note.note.assetId(), note.note.value())

        await this.walletDb.saveDecryptedNote(this, decryptedNote.hash, note, tx)
      }

      for (const spend of transaction.spends) {
        const spentNoteHash = await this.getNoteHash(spend.nullifier, tx)
        if (!spentNoteHash) {
          continue
        }

        const note = await this.getDecryptedNote(spentNoteHash, tx)

        Assert.isNotUndefined(note)

        assetBalanceDeltas.increment(note.note.assetId(), -note.note.value())

        const spentNote = { ...note, spent: true }
        await this.walletDb.saveDecryptedNote(this, spentNoteHash, spentNote, tx)

        const existingTransactionHash = await this.walletDb.getTransactionHashFromNullifier(
          this,
          spend.nullifier,
          tx,
        )
        if (!existingTransactionHash) {
          await this.walletDb.saveNullifierToTransactionHash(
            this,
            spend.nullifier,
            transaction,
            tx,
          )
        }

        await this.walletDb.deleteUnspentNoteHash(this, spentNoteHash, spentNote, tx)
      }

      // account did not receive or spend
      if (assetBalanceDeltas.size === 0) {
        return
      }

      const transactionValue = {
        transaction,
        blockHash: null,
        sequence: null,
        submittedSequence,
        timestamp: new Date(),
        assetBalanceDeltas,
      }

      await this.saveMintsToAssetsStore(transactionValue, tx)

      await this.walletDb.saveTransaction(this, transaction.hash(), transactionValue, tx)
    })
  }

  async disconnectTransaction(
    blockHeader: BlockHeader,
    transaction: Transaction,
    tx?: IDatabaseTransaction,
  ): Promise<AssetBalances> {
    const assetBalanceDeltas = new AssetBalances()
    await this.walletDb.db.withTransaction(tx, async (tx) => {
      const transactionValue = await this.getTransaction(transaction.hash(), tx)
      if (transactionValue === undefined) {
        return
      }

      for (const note of transaction.notes) {
        const noteHash = note.hash()

        const decryptedNoteValue = await this.getDecryptedNote(noteHash, tx)
        if (decryptedNoteValue === undefined) {
          continue
        }

        assetBalanceDeltas.increment(
          decryptedNoteValue.note.assetId(),
          -decryptedNoteValue.note.value(),
        )

        const sequence = decryptedNoteValue.sequence
        Assert.isNotNull(sequence)
        await this.walletDb.disconnectNoteHashSequence(this, noteHash, sequence, tx)

        Assert.isNotNull(decryptedNoteValue.nullifier)
        await this.walletDb.deleteNullifier(this, decryptedNoteValue.nullifier, tx)

        await this.walletDb.saveDecryptedNote(
          this,
          noteHash,
          {
            ...decryptedNoteValue,
            nullifier: null,
            index: null,
            blockHash: null,
            sequence: null,
          },
          tx,
        )
        await this.walletDb.deleteUnspentNoteHash(this, noteHash, decryptedNoteValue, tx)
      }

      for (const spend of transaction.spends) {
        const spentNoteHash = await this.getNoteHash(spend.nullifier, tx)
        if (!spentNoteHash) {
          continue
        }

        const spentNote = await this.getDecryptedNote(spentNoteHash, tx)

        Assert.isNotUndefined(spentNote)

        assetBalanceDeltas.increment(spentNote.note.assetId(), spentNote.note.value())
      }

      await this.deleteDisconnectedBurnsFromAssetsStore(transaction, tx)
      await this.deleteDisconnectedMintsFromAssetsStore(blockHeader, transaction, tx)
      await this.walletDb.deleteSequenceToTransactionHash(
        this,
        blockHeader.sequence,
        transaction.hash(),
        tx,
      )

      await this.walletDb.savePendingTransactionHash(
        this,
        transaction.expiration(),
        transaction.hash(),
        tx,
      )

      await this.walletDb.saveTransaction(
        this,
        transaction.hash(),
        { ...transactionValue, blockHash: null, sequence: null },
        tx,
      )
    })

    return assetBalanceDeltas
  }

  async deleteTransaction(transaction: Transaction, tx?: IDatabaseTransaction): Promise<void> {
    await this.walletDb.db.withTransaction(tx, async (tx) => {
      if (!(await this.hasTransaction(transaction.hash(), tx))) {
        return
      }

      // expiring transaction deletes output notes and sets spent notes to unspent
      await this.expireTransaction(transaction, tx)

      await this.walletDb.deleteTransaction(this, transaction.hash(), tx)
    })
  }

  private async deleteDecryptedNote(
    noteHash: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.walletDb.db.withTransaction(tx, async (tx) => {
      const decryptedNote = await this.getDecryptedNote(noteHash, tx)

      if (!decryptedNote) {
        return
      }

      await this.walletDb.deleteDecryptedNote(this, noteHash, tx)
      await this.walletDb.deleteNoteHashSequence(this, noteHash, decryptedNote.sequence, tx)

      if (decryptedNote.nullifier) {
        await this.walletDb.deleteNullifier(this, decryptedNote.nullifier, tx)
      }
    })
  }

  async getNoteHash(nullifier: Buffer, tx?: IDatabaseTransaction): Promise<Buffer | undefined> {
    return this.walletDb.loadNoteHash(this, nullifier, tx)
  }

  async getTransaction(
    hash: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<Readonly<TransactionValue> | undefined> {
    return await this.walletDb.loadTransaction(this, hash, tx)
  }

  async getAsset(
    id: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<Readonly<AssetValue> | undefined> {
    return this.walletDb.getAsset(this, id, tx)
  }

  async hasTransaction(hash: Buffer, tx?: IDatabaseTransaction): Promise<boolean> {
    return this.walletDb.hasTransaction(this, hash, tx)
  }

  async hasPendingTransaction(hash: Buffer, tx?: IDatabaseTransaction): Promise<boolean> {
    return this.walletDb.hasPendingTransaction(this, hash, tx)
  }

  getTransactions(
    range?: DatabaseKeyRange,
    tx?: IDatabaseTransaction,
  ): AsyncGenerator<Readonly<TransactionValue>> {
    return this.walletDb.loadTransactions(this, range, tx)
  }

  getTransactionsByTime(tx?: IDatabaseTransaction): AsyncGenerator<Readonly<TransactionValue>> {
    return this.walletDb.loadTransactionsByTime(this, tx)
  }

  async *getTransactionsBySequence(
    sequence: number,
    tx?: IDatabaseTransaction,
  ): AsyncGenerator<Readonly<TransactionValue>> {
    for await (const {
      hash: _hash,
      ...transaction
    } of this.walletDb.loadTransactionsInSequenceRange(this, sequence, sequence, tx)) {
      yield transaction
    }
  }

  async *getTransactionsOrderedBySequence(
    tx?: IDatabaseTransaction,
  ): AsyncGenerator<Readonly<TransactionValue>> {
    for await (const { hash } of this.walletDb.getTransactionHashesBySequence(this, tx)) {
      const transaction = await this.getTransaction(hash, tx)
      Assert.isNotUndefined(transaction)
      yield transaction
    }
  }

  getPendingTransactions(
    headSequence: number,
    tx?: IDatabaseTransaction,
  ): AsyncGenerator<TransactionValue> {
    return this.walletDb.loadPendingTransactions(this, headSequence, tx)
  }

  getExpiredTransactions(
    headSequence: number,
    tx?: IDatabaseTransaction,
  ): AsyncGenerator<TransactionValue> {
    return this.walletDb.loadExpiredTransactions(this, headSequence, tx)
  }

  async expireTransaction(transaction: Transaction, tx?: IDatabaseTransaction): Promise<void> {
    const transactionHash = transaction.hash()

    await this.walletDb.db.withTransaction(tx, async (tx) => {
      for (const note of transaction.notes) {
        await this.deleteDecryptedNote(note.hash(), tx)
      }

      for (const spend of transaction.spends) {
        const noteHash = await this.getNoteHash(spend.nullifier, tx)

        if (noteHash) {
          const decryptedNote = await this.getDecryptedNote(noteHash, tx)
          Assert.isNotUndefined(
            decryptedNote,
            'nullifierToNote mappings must have a corresponding decryptedNote',
          )

          const existingTransactionHash = await this.walletDb.getTransactionHashFromNullifier(
            this,
            spend.nullifier,
            tx,
          )
          // Remove the nullifier to transaction hash mapping and mark the note as unspent
          if (existingTransactionHash && existingTransactionHash.equals(transaction.hash())) {
            await this.walletDb.deleteNullifierToTransactionHash(this, spend.nullifier, tx)
            await this.walletDb.saveDecryptedNote(
              this,
              noteHash,
              {
                ...decryptedNote,
                spent: false,
              },
              tx,
            )
            await this.walletDb.addUnspentNoteHash(this, noteHash, decryptedNote, tx)
          }
        }
      }

      await this.deleteCreatedAssetsFromTransaction(transaction, tx)
      await this.walletDb.deletePendingTransactionHash(
        this,
        transaction.expiration(),
        transactionHash,
        tx,
      )
    })
  }

  private async deleteCreatedAssetsFromTransaction(
    transaction: Transaction,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    for (const { asset } of transaction.mints.slice().reverse()) {
      // Only update the mint for the owner
      if (asset.owner().toString('hex') !== this.publicAddress) {
        continue
      }

      const existingAsset = await this.walletDb.getAsset(this, asset.id(), tx)

      if (!existingAsset) {
        return
      }

      // If we are reverting the transaction which matches the created at
      // hash of the asset, delete the record from the store
      if (transaction.hash().equals(existingAsset.createdTransactionHash)) {
        await this.walletDb.deleteAsset(this, asset.id(), tx)
      }
    }
  }

  getAssets(tx?: IDatabaseTransaction): AsyncGenerator<Readonly<AssetValue>> {
    return this.walletDb.loadAssets(this, tx)
  }

  async *getBalances(
    confirmations: number,
    tx?: IDatabaseTransaction,
  ): AsyncGenerator<{
    assetId: Buffer
    unconfirmed: bigint
    unconfirmedCount: number
    confirmed: bigint
    pending: bigint
    pendingCount: number
    available: bigint
    blockHash: Buffer | null
    sequence: number | null
  }> {
    const head = await this.getHead()
    if (!head) {
      return
    }

    const pendingByAsset = await this.getPendingDeltas(head.sequence, tx)
    const unconfirmedByAsset = await this.getUnconfirmedDeltas(head.sequence, confirmations, tx)

    for await (const { assetId, balance } of this.walletDb.getUnconfirmedBalances(this, tx)) {
      const { delta: unconfirmedDelta, count: unconfirmedCount } = unconfirmedByAsset.get(
        assetId,
      ) ?? {
        delta: 0n,
        count: 0,
      }

      const { delta: pendingDelta, count: pendingCount } = pendingByAsset.get(assetId) ?? {
        delta: 0n,
        count: 0,
      }

      const available = await this.calculateAvailableBalance(
        head.sequence,
        assetId,
        confirmations,
        tx,
      )

      yield {
        assetId,
        unconfirmed: balance.unconfirmed,
        unconfirmedCount,
        confirmed: balance.unconfirmed - unconfirmedDelta,
        pending: balance.unconfirmed + pendingDelta,
        pendingCount,
        available,
        blockHash: balance.blockHash,
        sequence: balance.sequence,
      }
    }
  }

  /**
   * Gets the balance for an account
   * unconfirmed: all notes on the chain
   * confirmed: confirmed balance minus transactions in unconfirmed range
   */
  async getBalance(
    assetId: Buffer,
    confirmations: number,
    tx?: IDatabaseTransaction,
  ): Promise<{
    unconfirmed: bigint
    unconfirmedCount: number
    confirmed: bigint
    pending: bigint
    pendingCount: number
    available: bigint
    blockHash: Buffer | null
    sequence: number | null
  }> {
    const head = await this.getHead()
    if (!head) {
      return {
        unconfirmed: 0n,
        confirmed: 0n,
        pending: 0n,
        available: 0n,
        unconfirmedCount: 0,
        pendingCount: 0,
        blockHash: null,
        sequence: null,
      }
    }

    const balance = await this.getUnconfirmedBalance(assetId, tx)

    const { delta: unconfirmedDelta, count: unconfirmedCount } = await this.getUnconfirmedDelta(
      head.sequence,
      confirmations,
      assetId,
      tx,
    )

    const { delta: pendingDelta, count: pendingCount } = await this.getPendingDelta(
      head.sequence,
      assetId,
      tx,
    )

    const available = await this.calculateAvailableBalance(
      head.sequence,
      assetId,
      confirmations,
      tx,
    )

    return {
      unconfirmed: balance.unconfirmed,
      unconfirmedCount,
      confirmed: balance.unconfirmed - unconfirmedDelta,
      pending: balance.unconfirmed + pendingDelta,
      available,
      pendingCount,
      blockHash: balance.blockHash,
      sequence: balance.sequence,
    }
  }

  private async getPendingDelta(
    headSequence: number,
    assetId: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<{ delta: bigint; count: number }> {
    let delta = 0n
    let count = 0

    for await (const transaction of this.getPendingTransactions(headSequence, tx)) {
      const balanceDelta = transaction.assetBalanceDeltas.get(assetId)

      if (balanceDelta === undefined) {
        continue
      }

      delta += balanceDelta
      count++
    }

    return { delta, count }
  }

  private async getPendingDeltas(
    headSequence: number,
    tx?: IDatabaseTransaction,
  ): Promise<BufferMap<{ delta: bigint; count: number }>> {
    const pendingByAsset = new BufferMap<{ delta: bigint; count: number }>()

    for await (const transaction of this.getPendingTransactions(headSequence, tx)) {
      for (const [assetId, assetDelta] of transaction.assetBalanceDeltas.entries()) {
        const { delta, count } = pendingByAsset.get(assetId) ?? { delta: 0n, count: 0 }

        pendingByAsset.set(assetId, { delta: delta + assetDelta, count: count + 1 })
      }
    }

    return pendingByAsset
  }

  private async getUnconfirmedDelta(
    headSequence: number,
    confirmations: number,
    assetId: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<{ delta: bigint; count: number }> {
    let delta = 0n
    let count = 0

    if (confirmations > 0) {
      const unconfirmedSequenceEnd = headSequence

      const unconfirmedSequenceStart =
        Math.max(unconfirmedSequenceEnd - confirmations, GENESIS_BLOCK_SEQUENCE) + 1

      for await (const transaction of this.walletDb.loadTransactionsInSequenceRange(
        this,
        unconfirmedSequenceStart,
        unconfirmedSequenceEnd,
        tx,
      )) {
        const balanceDelta = transaction.assetBalanceDeltas.get(assetId)

        if (balanceDelta === undefined) {
          continue
        }

        count++
        delta += balanceDelta
      }
    }

    return {
      delta,
      count,
    }
  }

  private async getUnconfirmedDeltas(
    headSequence: number,
    confirmations: number,
    tx?: IDatabaseTransaction,
  ): Promise<BufferMap<{ delta: bigint; count: number }>> {
    const unconfirmedByAsset = new BufferMap<{ delta: bigint; count: number }>()

    if (confirmations > 0) {
      const unconfirmedSequenceEnd = headSequence

      const unconfirmedSequenceStart = Math.max(
        unconfirmedSequenceEnd - confirmations + 1,
        GENESIS_BLOCK_SEQUENCE,
      )

      for await (const transaction of this.walletDb.loadTransactionsInSequenceRange(
        this,
        unconfirmedSequenceStart,
        unconfirmedSequenceEnd,
        tx,
      )) {
        for (const [assetId, assetDelta] of transaction.assetBalanceDeltas.entries()) {
          const { delta, count } = unconfirmedByAsset.get(assetId) ?? { delta: 0n, count: 0 }

          unconfirmedByAsset.set(assetId, { delta: delta + assetDelta, count: count + 1 })
        }
      }
    }

    return unconfirmedByAsset
  }

  async calculateAvailableBalance(
    headSequence: number,
    assetId: Buffer,
    confirmations: number,
    tx?: IDatabaseTransaction,
  ): Promise<bigint> {
    let available = 0n

    const maxConfirmedSequence = Math.max(headSequence - confirmations, GENESIS_BLOCK_SEQUENCE)

    for await (const value of this.walletDb.loadUnspentNoteValues(
      this,
      assetId,
      maxConfirmedSequence,
      tx,
    )) {
      available += value
    }

    return available
  }

  async getUnconfirmedBalances(tx?: IDatabaseTransaction): Promise<BufferMap<BalanceValue>> {
    const unconfirmedBalances = new BufferMap<BalanceValue>()
    for await (const { assetId, balance } of this.walletDb.getUnconfirmedBalances(this, tx)) {
      unconfirmedBalances.set(assetId, balance)
    }
    return unconfirmedBalances
  }

  async getUnconfirmedBalance(
    assetId: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<BalanceValue> {
    return this.walletDb.getUnconfirmedBalance(this, assetId, tx)
  }

  async updateUnconfirmedBalances(
    balanceDeltas: BufferMap<bigint>,
    blockHash: Buffer | null,
    sequence: number | null,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    const unconfirmedBalances = await this.getUnconfirmedBalances(tx)

    for await (const [assetId, balance] of unconfirmedBalances.entries()) {
      const balanceDelta = balanceDeltas.get(assetId) ?? 0n

      await this.walletDb.saveUnconfirmedBalance(
        this,
        assetId,
        {
          unconfirmed: balance.unconfirmed + balanceDelta,
          blockHash,
          sequence,
        },
        tx,
      )
    }

    for (const [assetId, balanceDelta] of balanceDeltas.entries()) {
      if (unconfirmedBalances.has(assetId)) {
        continue
      }

      await this.walletDb.saveUnconfirmedBalance(
        this,
        assetId,
        {
          unconfirmed: balanceDelta,
          blockHash,
          sequence,
        },
        tx,
      )
    }
  }

  async saveUnconfirmedBalance(
    assetId: Buffer,
    balance: BalanceValue,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.walletDb.saveUnconfirmedBalance(this, assetId, balance, tx)
  }

  async getHead(tx?: IDatabaseTransaction): Promise<HeadValue | null> {
    return this.walletDb.getHead(this, tx)
  }

  async updateHead(head: HeadValue | null, tx?: IDatabaseTransaction): Promise<void> {
    await this.walletDb.saveHead(this, head, tx)
  }

  async updateCreatedAt(createdAt: HeadValue | null, tx?: IDatabaseTransaction): Promise<void> {
    this.createdAt = createdAt

    await this.walletDb.setAccount(this, tx)
  }

  async getTransactionNotes(
    transaction: Transaction,
  ): Promise<Array<DecryptedNoteValue & { hash: Buffer }>> {
    const notes = []

    for (const note of transaction.notes) {
      const noteHash = note.hash()
      const decryptedNote = await this.getDecryptedNote(noteHash)

      if (decryptedNote) {
        notes.push({
          ...decryptedNote,
          hash: noteHash,
        })
      }
    }

    return notes
  }
}

export function calculateAccountPrefix(id: string): Buffer {
  const seed = 1
  const hash = new MurmurHash3(id, seed).result()

  const prefix = Buffer.alloc(4)
  prefix.writeUInt32BE(hash)
  return prefix
}
