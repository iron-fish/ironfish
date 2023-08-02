/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../../assert'
import { FileSystem } from '../../fileSystems'
import { MerkleTree, NoteHasher, Witness } from '../../merkletree'
import { LeafEncoding } from '../../merkletree/database/leaves'
import { NodeEncoding } from '../../merkletree/database/nodes'
import { LeavesSchema } from '../../merkletree/schema'
import { Block, BlockHeader } from '../../primitives'
import { BlockHash } from '../../primitives/blockheader'
import {
  NoteEncrypted,
  NoteEncryptedHash,
  SerializedNoteEncrypted,
  SerializedNoteEncryptedHash,
} from '../../primitives/noteEncrypted'
import { Nullifier } from '../../primitives/nullifier'
import { TransactionHash } from '../../primitives/transaction'
import {
  BUFFER_ENCODING,
  IDatabase,
  IDatabaseStore,
  IDatabaseTransaction,
  SchemaValue,
  StringEncoding,
  U32_ENCODING,
} from '../../storage'
import { createDB } from '../../storage/utils'
import { NullifierSet } from '../nullifierSet/nullifierSet'
import {
  AssetSchema,
  HashToNextSchema,
  HeadersSchema,
  MetaSchema,
  SequenceToHashesSchema,
  SequenceToHashSchema,
  TransactionHashToBlockHashSchema,
  TransactionsSchema,
} from '../schema'
import { AssetValue, AssetValueEncoding } from './assetValue'
import { HeaderEncoding, HeaderValue } from './headers'
import { SequenceToHashesValueEncoding } from './sequenceToHashes'
import { TransactionsValue, TransactionsValueEncoding } from './transactions'

export const VERSION_DATABASE_CHAIN = 28

export class BlockchainDB {
  db: IDatabase
  location: string
  files: FileSystem

  // BlockHash -> BlockHeader
  headers: IDatabaseStore<HeadersSchema>
  // Contains flat fields
  meta: IDatabaseStore<MetaSchema>
  // BlockHash -> BlockHeader
  transactions: IDatabaseStore<TransactionsSchema>
  // Sequence -> BlockHash[]
  sequenceToHashes: IDatabaseStore<SequenceToHashesSchema>
  // Sequence -> BlockHash
  sequenceToHash: IDatabaseStore<SequenceToHashSchema>
  // BlockHash -> BlockHash
  hashToNextHash: IDatabaseStore<HashToNextSchema>
  // Asset Identifier -> Asset
  assets: IDatabaseStore<AssetSchema>
  // TransactionHash -> BlockHash
  transactionHashToBlockHash: IDatabaseStore<TransactionHashToBlockHashSchema>

  notes: MerkleTree<
    NoteEncrypted,
    NoteEncryptedHash,
    SerializedNoteEncrypted,
    SerializedNoteEncryptedHash
  >

  nullifiers: NullifierSet

  constructor(options: { location: string; files: FileSystem }) {
    this.location = options.location
    this.files = options.files
    this.db = createDB({ location: options.location })

    // BlockHash -> BlockHeader
    this.headers = this.db.addStore({
      name: 'bh',
      keyEncoding: BUFFER_ENCODING,
      valueEncoding: new HeaderEncoding(),
    })

    // Flat Fields
    this.meta = this.db.addStore({
      name: 'bm',
      keyEncoding: new StringEncoding<'head' | 'latest'>(),
      valueEncoding: BUFFER_ENCODING,
    })

    // BlockHash -> Transaction[]
    this.transactions = this.db.addStore({
      name: 'bt',
      keyEncoding: BUFFER_ENCODING,
      valueEncoding: new TransactionsValueEncoding(),
    })

    // number -> BlockHash[]
    this.sequenceToHashes = this.db.addStore({
      name: 'bs',
      keyEncoding: U32_ENCODING,
      valueEncoding: new SequenceToHashesValueEncoding(),
    })

    // number -> BlockHash
    this.sequenceToHash = this.db.addStore({
      name: 'bS',
      keyEncoding: U32_ENCODING,
      valueEncoding: BUFFER_ENCODING,
    })

    this.hashToNextHash = this.db.addStore({
      name: 'bH',
      keyEncoding: BUFFER_ENCODING,
      valueEncoding: BUFFER_ENCODING,
    })

    this.assets = this.db.addStore({
      name: 'bA',
      keyEncoding: BUFFER_ENCODING,
      valueEncoding: new AssetValueEncoding(),
    })

    this.transactionHashToBlockHash = this.db.addStore({
      name: 'tb',
      keyEncoding: BUFFER_ENCODING,
      valueEncoding: BUFFER_ENCODING,
    })

    this.notes = new MerkleTree({
      hasher: new NoteHasher(),
      leafIndexKeyEncoding: BUFFER_ENCODING,
      leafEncoding: new LeafEncoding(),
      nodeEncoding: new NodeEncoding(),
      db: this.db,
      name: 'n',
      depth: 32,
      defaultValue: Buffer.alloc(32),
    })

    this.nullifiers = new NullifierSet({ db: this.db, name: 'u' })
  }

  async open(): Promise<void> {
    await this.files.mkdir(this.location, { recursive: true })
    await this.db.open()
    await this.db.upgrade(VERSION_DATABASE_CHAIN)
  }

  async close(): Promise<void> {
    await this.db.close()
  }

  async getBlockHeader(
    blockHash: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<BlockHeader | undefined> {
    return (await this.headers.get(blockHash, tx))?.header
  }

  async deleteHeader(hash: Buffer, tx?: IDatabaseTransaction): Promise<void> {
    return this.headers.del(hash, tx)
  }

  async putBlockHeader(
    hash: Buffer,
    header: HeaderValue,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    return this.headers.put(hash, header, tx)
  }

  async getMetaHash(
    key: 'head' | 'latest',
    tx?: IDatabaseTransaction,
  ): Promise<Buffer | undefined> {
    return this.meta.get(key, tx)
  }

  async putMetaHash(
    key: 'head' | 'latest',
    value: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    return this.meta.put(key, value, tx)
  }

  async getTransactions(
    blockHash: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<TransactionsValue | undefined> {
    return this.transactions.get(blockHash, tx)
  }

  async addTransaction(
    hash: Buffer,
    value: TransactionsValue,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    return this.transactions.add(hash, value, tx)
  }

  async putTransaction(
    hash: Buffer,
    value: TransactionsValue,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    return this.transactions.put(hash, value, tx)
  }

  async deleteTransaction(hash: Buffer, tx?: IDatabaseTransaction): Promise<void> {
    return this.transactions.del(hash, tx)
  }

  async getBlockHashesAtSequence(
    sequence: number,
    tx?: IDatabaseTransaction,
  ): Promise<BlockHash[]> {
    const hashes = await this.sequenceToHashes.get(sequence, tx)
    if (!hashes) {
      return []
    }

    return hashes.hashes
  }

  async getBlockHeadersAtSequence(
    sequence: number,
    tx?: IDatabaseTransaction,
  ): Promise<BlockHeader[]> {
    const hashes = await this.sequenceToHashes.get(sequence, tx)

    if (!hashes) {
      return []
    }

    const headers = await Promise.all(
      hashes.hashes.map(async (h) => {
        const header = await this.getBlockHeader(h, tx)
        Assert.isNotUndefined(header)
        return header
      }),
    )

    return headers
  }

  async deleteSequenceToHashes(sequence: number, tx?: IDatabaseTransaction): Promise<void> {
    return this.sequenceToHashes.del(sequence, tx)
  }

  async putSequenceToHashes(
    sequence: number,
    hashes: Buffer[],
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    return this.sequenceToHashes.put(sequence, { hashes }, tx)
  }

  async getBlockHashAtSequence(
    sequence: number,
    tx?: IDatabaseTransaction,
  ): Promise<BlockHash | undefined> {
    return this.sequenceToHash.get(sequence, tx)
  }

  async getBlockHeaderAtSequence(sequence: number): Promise<BlockHeader | undefined> {
    const hash = await this.sequenceToHash.get(sequence)
    if (!hash) {
      return undefined
    }

    return this.getBlockHeader(hash)
  }

  async putSequenceToHash(
    sequence: number,
    hash: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    return this.sequenceToHash.put(sequence, hash, tx)
  }

  async deleteSequenceToHash(sequence: number, tx?: IDatabaseTransaction): Promise<void> {
    return this.sequenceToHash.del(sequence, tx)
  }

  async clearSequenceToHash(tx?: IDatabaseTransaction): Promise<void> {
    return this.sequenceToHash.clear(tx)
  }

  async getNextHash(
    hash: BlockHash,
    tx?: IDatabaseTransaction,
  ): Promise<BlockHash | undefined> {
    return this.hashToNextHash.get(hash, tx)
  }

  async putNextHash(hash: Buffer, nextHash: Buffer, tx?: IDatabaseTransaction): Promise<void> {
    return this.hashToNextHash.put(hash, nextHash, tx)
  }

  async deleteNextHash(hash: Buffer, tx?: IDatabaseTransaction): Promise<void> {
    return this.hashToNextHash.del(hash, tx)
  }

  async clearHashToNextHash(tx?: IDatabaseTransaction): Promise<void> {
    return this.hashToNextHash.clear(tx)
  }

  async getAsset(assetId: Buffer, tx?: IDatabaseTransaction): Promise<AssetValue | undefined> {
    return this.assets.get(assetId, tx)
  }

  async putAsset(
    assetId: Buffer,
    assetValue: AssetValue,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    return this.assets.put(assetId, assetValue, tx)
  }

  async deleteAsset(assetId: Buffer, tx?: IDatabaseTransaction): Promise<void> {
    return this.assets.del(assetId, tx)
  }

  async getBlockHashByTransactionHash(
    transactionHash: TransactionHash,
    tx?: IDatabaseTransaction,
  ): Promise<BlockHash | undefined> {
    return this.transactionHashToBlockHash.get(transactionHash, tx)
  }

  async transactionHashHasBlock(
    transactionHash: TransactionHash,
    tx?: IDatabaseTransaction,
  ): Promise<boolean> {
    return this.transactionHashToBlockHash.has(transactionHash, tx)
  }

  async putTransactionHashToBlockHash(
    transactionHash: Buffer,
    blockHash: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    return this.transactionHashToBlockHash.put(transactionHash, blockHash, tx)
  }

  async deleteTransactionHashToBlockHash(
    transactionHash: Buffer,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    return this.transactionHashToBlockHash.del(transactionHash, tx)
  }

  async addNotesBatch(
    notes: Iterable<NoteEncrypted>,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    return this.notes.addBatch(notes, tx)
  }

  async addNote(note: NoteEncrypted, tx?: IDatabaseTransaction): Promise<void> {
    return this.notes.add(note, tx)
  }

  async getNotesPastRoot(
    pastSize: number,
    tx?: IDatabaseTransaction,
  ): Promise<NoteEncryptedHash> {
    return this.notes.pastRoot(pastSize, tx)
  }

  async getNotesSize(tx?: IDatabaseTransaction): Promise<number> {
    return this.notes.size(tx)
  }

  async getNotesRootHash(tx?: IDatabaseTransaction): Promise<Buffer> {
    return this.notes.rootHash(tx)
  }

  async truncateNotes(pastSize: number, tx?: IDatabaseTransaction): Promise<void> {
    return this.notes.truncate(pastSize, tx)
  }

  cachePastRootHashes(tx: IDatabaseTransaction): void {
    return this.notes.pastRootTxCommitted(tx)
  }

  async getNoteWitness(
    treeIndex: number,
    size?: number,
    tx?: IDatabaseTransaction,
  ): Promise<Witness<
    NoteEncrypted,
    NoteEncryptedHash,
    SerializedNoteEncrypted,
    SerializedNoteEncryptedHash
  > | null> {
    return this.notes.witness(treeIndex, size, tx)
  }

  async getLeavesIndex(hash: Buffer, tx?: IDatabaseTransaction): Promise<number | undefined> {
    return this.notes.leavesIndex.get(hash, tx)
  }

  async getNotesLeaf(
    index: number,
    tx?: IDatabaseTransaction,
  ): Promise<SchemaValue<LeavesSchema<NoteEncryptedHash>>> {
    return this.notes.getLeaf(index, tx)
  }

  async getNullifiersSize(tx?: IDatabaseTransaction): Promise<number> {
    return this.nullifiers.size(tx)
  }

  async getTransactionHashByNullifier(
    nullifier: Nullifier,
    tx?: IDatabaseTransaction,
  ): Promise<TransactionHash | undefined> {
    return this.nullifiers.get(nullifier, tx)
  }

  async connectBlockToNullifiers(block: Block, tx?: IDatabaseTransaction): Promise<void> {
    return this.nullifiers.connectBlock(block, tx)
  }

  async disconnectBlockFromNullifiers(block: Block, tx?: IDatabaseTransaction): Promise<void> {
    return this.nullifiers.disconnectBlock(block, tx)
  }

  async hasNullifier(nullifier: Nullifier, tx?: IDatabaseTransaction): Promise<boolean> {
    return this.nullifiers.contains(nullifier, tx)
  }

  async clearNullifiers(tx?: IDatabaseTransaction): Promise<void> {
    return this.nullifiers.clear(tx)
  }

  async compact(): Promise<void> {
    return this.db.compact()
  }

  async getVersion(): Promise<number> {
    return this.db.getVersion()
  }

  transaction(): IDatabaseTransaction {
    return this.db.transaction()
  }

  async size(): Promise<number> {
    return this.db.size()
  }
}
