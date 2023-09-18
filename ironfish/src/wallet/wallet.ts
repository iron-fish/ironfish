/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset, generateKey, Note as NativeNote } from '@ironfish/rust-nodejs'
import { BufferMap, BufferSet } from 'buffer-map'
import { v4 as uuid } from 'uuid'
import { Assert } from '../assert'
import { Consensus, isExpiredSequence, Verifier } from '../consensus'
import { Event } from '../event'
import { Config } from '../fileStores'
import { createRootLogger, Logger } from '../logger'
import { getFee } from '../memPool/feeEstimator'
import { NoteHasher } from '../merkletree'
import { Side } from '../merkletree/merkletree'
import { Witness } from '../merkletree/witness'
import { Mutex } from '../mutex'
import { GENESIS_BLOCK_SEQUENCE } from '../primitives'
import { BurnDescription } from '../primitives/burnDescription'
import { MintDescription } from '../primitives/mintDescription'
import { Note } from '../primitives/note'
import { NoteEncrypted } from '../primitives/noteEncrypted'
import { MintData, RawTransaction } from '../primitives/rawTransaction'
import { Transaction } from '../primitives/transaction'
import { GetBlockRequest, GetBlockResponse, RpcClient } from '../rpc'
import { IDatabaseTransaction } from '../storage/database/transaction'
import {
  AsyncUtils,
  BufferUtils,
  ErrorUtils,
  HashUtils,
  PromiseResolve,
  PromiseUtils,
  SetTimeoutToken,
  TransactionUtils,
} from '../utils'
import { WorkerPool } from '../workerPool'
import { DecryptedNote, DecryptNoteOptions } from '../workerPool/tasks/decryptNotes'
import { Account, ACCOUNT_SCHEMA_VERSION } from './account/account'
import { AssetBalances } from './assetBalances'
import { NotEnoughFundsError } from './errors'
import { MintAssetOptions } from './interfaces/mintAssetOptions'
import {
  RemoteChainProcessor,
  WalletBlockHeader,
  WalletBlockTransaction,
} from './remoteChainProcessor'
import { validateAccount } from './validator'
import { AccountValue } from './walletdb/accountValue'
import { AssetValue } from './walletdb/assetValue'
import { DecryptedNoteValue } from './walletdb/decryptedNoteValue'
import { HeadValue } from './walletdb/headValue'
import { TransactionValue } from './walletdb/transactionValue'
import { WalletDB } from './walletdb/walletdb'

export enum AssetStatus {
  CONFIRMED = 'confirmed',
  PENDING = 'pending',
  UNCONFIRMED = 'unconfirmed',
  UNKNOWN = 'unknown',
}

export enum TransactionStatus {
  CONFIRMED = 'confirmed',
  EXPIRED = 'expired',
  PENDING = 'pending',
  UNCONFIRMED = 'unconfirmed',
  UNKNOWN = 'unknown',
}

export enum TransactionType {
  SEND = 'send',
  RECEIVE = 'receive',
  MINER = 'miner',
}

export type TransactionOutput = {
  publicAddress: string
  amount: bigint
  memo: string
  assetId: Buffer
}

export class Wallet {
  readonly onAccountImported = new Event<[account: Account]>()
  readonly onAccountRemoved = new Event<[account: Account]>()

  scan: ScanState | null = null
  updateHeadState: ScanState | null = null

  protected readonly accounts = new Map<string, Account>()
  readonly walletDb: WalletDB
  private readonly logger: Logger
  readonly workerPool: WorkerPool
  readonly chainProcessor: RemoteChainProcessor
  readonly nodeClient: RpcClient | null
  private readonly config: Config
  private readonly consensus: Consensus

  protected rebroadcastAfter: number
  protected defaultAccount: string | null = null
  protected isStarted = false
  protected isOpen = false
  protected isSyncingTransactionGossip = false
  protected eventLoopTimeout: SetTimeoutToken | null = null
  private readonly createTransactionMutex: Mutex
  private readonly eventLoopAbortController: AbortController
  private eventLoopPromise: Promise<void> | null = null
  private eventLoopResolve: PromiseResolve<void> | null = null

  constructor({
    config,
    database,
    logger = createRootLogger(),
    rebroadcastAfter,
    workerPool,
    consensus,
    nodeClient,
  }: {
    config: Config
    database: WalletDB
    logger?: Logger
    rebroadcastAfter?: number
    workerPool: WorkerPool
    consensus: Consensus
    nodeClient: RpcClient | null
  }) {
    this.config = config
    this.logger = logger.withTag('accounts')
    this.walletDb = database
    this.workerPool = workerPool
    this.consensus = consensus
    this.nodeClient = nodeClient || null
    this.rebroadcastAfter = rebroadcastAfter ?? 10
    this.createTransactionMutex = new Mutex()
    this.eventLoopAbortController = new AbortController()

    this.chainProcessor = new RemoteChainProcessor({
      logger: this.logger,
      nodeClient: this.nodeClient,
      head: null,
      maxQueueSize: this.config.get('walletSyncingMaxQueueSize'),
    })

    this.chainProcessor.onAdd.on(async ({ header, transactions }) => {
      if (Number(header.sequence) % this.config.get('walletSyncingMaxQueueSize') === 0) {
        this.logger.info(
          'Added block' +
            ` seq: ${Number(header.sequence)},` +
            ` hash: ${HashUtils.renderHash(header.hash)}`,
        )
      }

      await this.connectBlock(header, transactions)
      await this.expireTransactions(header.sequence)
      await this.rebroadcastTransactions(header.sequence)
    })

    this.chainProcessor.onRemove.on(async ({ header, transactions }) => {
      this.logger.debug(`AccountHead DEL: ${header.sequence} => ${Number(header.sequence) - 1}`)

      await this.disconnectBlock(header, transactions)
    })
  }

  async updateHead(): Promise<void> {
    if (this.scan || this.updateHeadState || this.accounts.size === 0) {
      return
    }

    // TODO: this isn't right, as the scan state doesn't get its sequence or
    // endSequence set properly
    const scan = new ScanState()
    this.updateHeadState = scan

    try {
      let hashChanged = false
      do {
        hashChanged = (
          await this.chainProcessor.update({ signal: scan.abortController.signal })
        ).hashChanged
        if (hashChanged) {
          this.logger.debug(
            `Updated Accounts Head: ${String(this.chainProcessor.hash?.toString('hex'))}`,
          )
        }
      } while (hashChanged)
    } finally {
      scan.signalComplete()
      this.updateHeadState = null
    }
  }

  async shouldRescan(): Promise<boolean> {
    if (this.scan) {
      return false
    }

    for (const account of this.accounts.values()) {
      if (!(await this.isAccountUpToDate(account))) {
        return true
      }
    }

    return false
  }

  async open(): Promise<void> {
    if (this.isOpen) {
      return
    }

    this.isOpen = true
    await this.walletDb.open()
    await this.load()
  }

  private async load(): Promise<void> {
    for await (const accountValue of this.walletDb.loadAccounts()) {
      const account = new Account({
        ...accountValue,
        walletDb: this.walletDb,
      })

      this.accounts.set(account.id, account)
    }

    const latestHead = await this.getLatestHead()
    if (latestHead) {
      this.chainProcessor.hash = latestHead.hash
      this.chainProcessor.sequence = latestHead.sequence
    }

    const meta = await this.walletDb.loadAccountsMeta()
    this.defaultAccount = meta.defaultAccountId
  }

  private unload(): void {
    this.accounts.clear()

    this.defaultAccount = null
    this.chainProcessor.hash = null
    this.chainProcessor.sequence = null
  }

  async close(): Promise<void> {
    if (!this.isOpen) {
      return
    }

    this.isOpen = false
    await this.walletDb.close()
    this.unload()
  }

  async start(): Promise<void> {
    if (this.isStarted) {
      return
    }
    this.isStarted = true

    if (this.chainProcessor.hash) {
      const hasHeadBlock = await this.chainHasBlock(this.chainProcessor.hash)

      if (!hasHeadBlock) {
        throw new Error(
          `Wallet has scanned to block ${this.chainProcessor.hash.toString(
            'hex',
          )}, but node's chain does not contain that block. Unable to sync from node without rescan.`,
        )
      }
    }

    const chainHead = await this.getChainHead()

    for (const account of this.listAccounts()) {
      if (account.createdAt === null) {
        continue
      }

      if (account.createdAt.sequence > chainHead.sequence) {
        continue
      }

      if (!(await this.chainHasBlock(account.createdAt.hash))) {
        this.logger.warn(
          `Account ${account.name} createdAt refers to a block that is not on the node's chain. Resetting to null.`,
        )
        await account.updateCreatedAt(null)
      }
    }

    if (!this.scan && (await this.shouldRescan())) {
      void this.scanTransactions()
    }

    void this.eventLoop()
  }

  async stop(): Promise<void> {
    if (!this.isStarted) {
      return
    }
    this.isStarted = false

    if (this.eventLoopTimeout) {
      clearTimeout(this.eventLoopTimeout)
    }

    await Promise.all([this.scan?.abort(), this.updateHeadState?.abort()])
    this.eventLoopAbortController.abort()

    await this.eventLoopPromise
  }

  async eventLoop(): Promise<void> {
    if (!this.isStarted) {
      return
    }

    const [promise, resolve] = PromiseUtils.split<void>()
    this.eventLoopPromise = promise
    this.eventLoopResolve = resolve

    await this.updateHead()
    void this.syncTransactionGossip()
    await this.cleanupDeletedAccounts()

    if (this.isStarted) {
      this.eventLoopTimeout = setTimeout(() => void this.eventLoop(), 1000)
    }

    resolve()
    this.eventLoopPromise = null
    this.eventLoopResolve = null
  }

  async syncTransactionGossip(): Promise<void> {
    if (this.isSyncingTransactionGossip) {
      return
    }

    try {
      Assert.isNotNull(this.nodeClient)
      const response = this.nodeClient.event.onTransactionGossipStream()

      this.isSyncingTransactionGossip = true

      for await (const content of response.contentStream()) {
        if (!content.valid) {
          continue
        }

        const transaction = new Transaction(Buffer.from(content.serializedTransaction, 'hex'))

        // Start dropping trasactions if we have too many to process
        if (response.bufferSize() > this.config.get('walletGossipTransactionsMaxQueueSize')) {
          const hash = transaction.hash().toString('hex')
          this.logger.info(
            `Too many gossiped transactions to process. Dropping transaction ${hash}`,
          )
          continue
        }

        await this.addPendingTransaction(transaction)
      }
    } catch (e: unknown) {
      this.logger.error(`Error syncing transaction gossip: ${ErrorUtils.renderError(e)}`)
    } finally {
      this.isSyncingTransactionGossip = false
    }
  }

  async reset(): Promise<void> {
    await this.resetAccounts()

    this.chainProcessor.hash = null
  }

  private async resetAccounts(tx?: IDatabaseTransaction): Promise<void> {
    for (const account of this.listAccounts()) {
      await this.resetAccount(account, { tx })
    }
  }

  async decryptNotes(
    transaction: Transaction,
    initialNoteIndex: number | null,
    decryptForSpender: boolean,
    accounts?: Array<Account>,
  ): Promise<Map<string, Array<DecryptedNote>>> {
    const accountsToCheck =
      accounts ||
      (await AsyncUtils.filter(
        this.listAccounts(),
        async (a) => await this.isAccountUpToDate(a),
      ))

    const decryptedNotesByAccountId = new Map<string, Array<DecryptedNote>>()

    const batchSize = 20
    for (const account of accountsToCheck) {
      const decryptedNotes = []
      let decryptNotesPayloads = []
      let currentNoteIndex = initialNoteIndex

      for (const note of transaction.notes) {
        decryptNotesPayloads.push({
          serializedNote: note.serialize(),
          incomingViewKey: account.incomingViewKey,
          outgoingViewKey: account.outgoingViewKey,
          viewKey: account.viewKey,
          currentNoteIndex,
          decryptForSpender,
        })

        if (currentNoteIndex) {
          currentNoteIndex++
        }

        if (decryptNotesPayloads.length >= batchSize) {
          const decryptedNotesBatch = await this.decryptNotesFromTransaction(
            decryptNotesPayloads,
          )
          decryptedNotes.push(...decryptedNotesBatch)
          decryptNotesPayloads = []
        }
      }

      if (decryptNotesPayloads.length) {
        const decryptedNotesBatch = await this.decryptNotesFromTransaction(decryptNotesPayloads)
        decryptedNotes.push(...decryptedNotesBatch)
      }

      if (decryptedNotes.length) {
        decryptedNotesByAccountId.set(account.id, decryptedNotes)
      }
    }

    return decryptedNotesByAccountId
  }

  async decryptNotesFromTransaction(
    decryptNotesPayloads: Array<DecryptNoteOptions>,
  ): Promise<Array<DecryptedNote>> {
    const decryptedNotes = []
    const response = await this.workerPool.decryptNotes(decryptNotesPayloads)
    for (const decryptedNote of response) {
      if (decryptedNote) {
        decryptedNotes.push(decryptedNote)
      }
    }

    return decryptedNotes
  }

  async connectBlock(
    blockHeader: WalletBlockHeader,
    transactions: WalletBlockTransaction[],
    scan?: ScanState,
  ): Promise<void> {
    const accounts = await AsyncUtils.filter(this.listAccounts(), async (account) => {
      const accountHead = await account.getHead()

      if (!accountHead) {
        return blockHeader.sequence === 1
      } else {
        return BufferUtils.equalsNullable(accountHead.hash, blockHeader.previousBlockHash)
      }
    })

    for (const account of accounts) {
      const shouldDecrypt = await this.shouldDecryptForAccount(blockHeader, account)

      if (scan && scan.isAborted) {
        scan.signalComplete()
        this.scan = null
        return
      }

      await this.walletDb.db.transaction(async (tx) => {
        let assetBalanceDeltas = new AssetBalances()

        if (shouldDecrypt) {
          assetBalanceDeltas = await this.connectBlockTransactions(
            blockHeader,
            transactions,
            account,
            scan,
            tx,
          )
        }

        await account.updateUnconfirmedBalances(
          assetBalanceDeltas,
          blockHeader.hash,
          blockHeader.sequence,
          tx,
        )

        await account.updateHead({ hash: blockHeader.hash, sequence: blockHeader.sequence }, tx)

        const accountHasTransaction = assetBalanceDeltas.size > 0
        if (account.createdAt === null && accountHasTransaction) {
          await account.updateCreatedAt(
            { hash: blockHeader.hash, sequence: blockHeader.sequence },
            tx,
          )
        }
      })
    }
  }

  async shouldDecryptForAccount(
    blockHeader: WalletBlockHeader,
    account: Account,
  ): Promise<boolean> {
    if (account.createdAt === null) {
      return true
    }

    if (account.createdAt.sequence > blockHeader.sequence) {
      return false
    }

    if (
      account.createdAt.sequence === blockHeader.sequence &&
      !account.createdAt.hash.equals(blockHeader.hash)
    ) {
      this.logger.warn(
        `Account ${account.name} createdAt refers to a block that is not on the node's chain. Stopping scan for this account.`,
      )
      await account.updateCreatedAt(null)
      // Sets head to null to avoid connecting blocks for this account
      await account.updateHead(null)
      return false
    }

    return true
  }

  private async connectBlockTransactions(
    blockHeader: WalletBlockHeader,
    transactions: WalletBlockTransaction[],
    account: Account,
    scan?: ScanState,
    tx?: IDatabaseTransaction,
  ): Promise<AssetBalances> {
    const assetBalanceDeltas = new AssetBalances()

    for (const { transaction, initialNoteIndex } of transactions) {
      if (scan && scan.isAborted) {
        return assetBalanceDeltas
      }

      const decryptedNotesByAccountId = await this.decryptNotes(
        transaction,
        initialNoteIndex,
        false,
        [account],
      )

      const decryptedNotes = decryptedNotesByAccountId.get(account.id) ?? []

      const transactionDeltas = await account.connectTransaction(
        blockHeader,
        transaction,
        decryptedNotes,
        tx,
      )

      assetBalanceDeltas.update(transactionDeltas)

      await this.upsertAssetsFromDecryptedNotes(account, decryptedNotes, blockHeader, tx)
    }

    return assetBalanceDeltas
  }

  private async upsertAssetsFromDecryptedNotes(
    account: Account,
    decryptedNotes: DecryptedNote[],
    blockHeader: WalletBlockHeader,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    for (const { serializedNote } of decryptedNotes) {
      const note = new Note(serializedNote)
      const asset = await this.getOrBackfillAsset(account, note.assetId(), false, tx)
      Assert.isNotNull(asset, 'Asset must be non-null in the chain')
      await account.updateAssetWithBlockHeader(asset, blockHeader, tx)
    }
  }

  /**
   * Ensures that the wallet db contains information about the assets involved
   * in the given notes and mints.
   *
   * This method checks that each asset is in the wallet db and, if it cannot
   * be found, then the information is copied from the chain db into the wallet
   * db.
   */
  private async backfillAssets(
    account: Account,
    decryptedNotes: DecryptedNote[],
    mints: MintDescription[],
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    const backfilled = new BufferSet()
    for (const { serializedNote } of decryptedNotes) {
      const note = new Note(serializedNote)
      const assetId = note.assetId()
      if (!backfilled.has(assetId)) {
        await this.getOrBackfillAsset(account, assetId, false, tx)
        backfilled.add(assetId)
      }
    }
    for (const { asset } of mints) {
      const assetId = asset.id()
      if (!backfilled.has(assetId)) {
        await this.getOrBackfillAsset(account, assetId, true, tx)
        backfilled.add(assetId)
      }
    }
  }

  private async getOrBackfillAsset(
    account: Account,
    assetId: Buffer,
    onlyIfOwned: boolean,
    tx?: IDatabaseTransaction,
  ): Promise<AssetValue | null> {
    const asset = await this.walletDb.getAsset(account, assetId, tx)

    // If the asset is not known to the wallet db, backfill it from the chain db.
    if (!asset) {
      const chainAsset = await this.getChainAsset(assetId)
      if (!chainAsset) {
        return null
      }
      if (onlyIfOwned && chainAsset.owner.toString('hex') !== account.publicAddress) {
        return null
      }
      await account.saveAssetFromChain(
        chainAsset.createdTransactionHash,
        chainAsset.id,
        chainAsset.metadata,
        chainAsset.name,
        chainAsset.nonce,
        chainAsset.creator,
        chainAsset.owner,
        undefined,
        tx,
      )
      return {
        blockHash: null,
        sequence: null,
        supply: null,
        ...chainAsset,
      }
    }

    return asset
  }

  async disconnectBlock(
    header: WalletBlockHeader,
    transactions: WalletBlockTransaction[],
  ): Promise<void> {
    const accounts = await AsyncUtils.filter(this.listAccounts(), async (account) => {
      const accountHead = await account.getHead()

      return BufferUtils.equalsNullable(accountHead?.hash ?? null, header.hash)
    })

    for (const account of accounts) {
      const assetBalanceDeltas = new AssetBalances()

      await this.walletDb.db.transaction(async (tx) => {
        for (const { transaction } of transactions.slice().reverse()) {
          const transactionDeltas = await account.disconnectTransaction(header, transaction, tx)

          assetBalanceDeltas.update(transactionDeltas)

          if (transaction.isMinersFee()) {
            await account.deleteTransaction(transaction, tx)
          }
        }

        await account.updateUnconfirmedBalances(
          assetBalanceDeltas,
          header.previousBlockHash,
          header.sequence - 1,
          tx,
        )

        await account.updateHead(
          { hash: header.previousBlockHash, sequence: header.sequence - 1 },
          tx,
        )

        if (account.createdAt?.hash.equals(header.hash)) {
          await account.updateCreatedAt(
            { hash: header.previousBlockHash, sequence: header.sequence - 1 },
            tx,
          )
        }
      })
    }
  }

  async addPendingTransaction(transaction: Transaction): Promise<void> {
    const accounts = await AsyncUtils.filter(
      this.listAccounts(),
      async (account) => !(await account.hasTransaction(transaction.hash())),
    )

    if (accounts.length === 0) {
      return
    }

    const decryptedNotesByAccountId = await this.decryptNotes(
      transaction,
      null,
      false,
      accounts,
    )

    const head = await this.getChainHead()

    for (const account of accounts) {
      const decryptedNotes = decryptedNotesByAccountId.get(account.id) ?? []

      await this.backfillAssets(account, decryptedNotes, transaction.mints)
      await account.addPendingTransaction(transaction, decryptedNotes, head.sequence)
    }
  }

  async scanTransactions(fromHash?: Buffer, force?: boolean): Promise<void> {
    if (!this.isOpen) {
      throw new Error('Cannot start a scan if accounts are not loaded')
    }

    if (!this.config.get('enableWallet')) {
      this.logger.info('Skipping Scan, wallet is not started.')
      return
    }

    if (this.scan) {
      if (force) {
        this.logger.info('Aborting scan in progress and starting new scan.')
        await this.scan.abort()
      } else {
        this.logger.info('Skipping Scan, already scanning.')
        return
      }
    }

    const scan = new ScanState()
    this.scan = scan

    // If we are updating the account head, we need to wait until its finished
    // but setting this.scan is our lock so updating the head doesn't run again
    await this.updateHeadState?.wait()

    const startHash = fromHash ?? (await this.getEarliestHeadHash())

    // Fetch current chain head sequence
    const chainHead = await this.getChainHead()
    scan.endSequence = chainHead.sequence

    this.logger.info(`Scan starting from block ${startHash?.toString('hex') ?? 'null'}`)

    const scanProcessor = new RemoteChainProcessor({
      logger: this.logger,
      nodeClient: this.nodeClient,
      head: startHash,
      maxQueueSize: this.config.get('walletSyncingMaxQueueSize'),
    })

    scanProcessor.onAdd.on(async ({ header, transactions }) => {
      await this.connectBlock(header, transactions, scan)
      scan.signal(header.sequence)
    })

    scanProcessor.onRemove.on(async ({ header, transactions }) => {
      await this.disconnectBlock(header, transactions)
    })

    let hashChanged = false
    do {
      hashChanged = (await scanProcessor.update({ signal: scan.abortController.signal }))
        .hashChanged
    } while (hashChanged)

    // Update chainProcessor following scan
    this.chainProcessor.hash = scanProcessor.hash
    this.chainProcessor.sequence = scanProcessor.sequence

    this.logger.info(
      `Finished scanning for transactions after ${Math.floor(
        (Date.now() - scan.startedAt) / 1000,
      )} seconds`,
    )

    scan.signalComplete()
    this.scan = null
  }

  async *getBalances(
    account: Account,
    confirmations?: number,
  ): AsyncGenerator<{
    assetId: Buffer
    unconfirmed: bigint
    unconfirmedCount: number
    pending: bigint
    pendingCount: number
    confirmed: bigint
    available: bigint
    blockHash: Buffer | null
    sequence: number | null
  }> {
    confirmations = confirmations ?? this.config.get('confirmations')

    this.assertHasAccount(account)

    for await (const balance of account.getBalances(confirmations)) {
      yield balance
    }
  }

  async getBalance(
    account: Account,
    assetId: Buffer,
    options?: { confirmations?: number },
  ): Promise<{
    unconfirmedCount: number
    unconfirmed: bigint
    confirmed: bigint
    pendingCount: number
    pending: bigint
    available: bigint
    blockHash: Buffer | null
    sequence: number | null
  }> {
    const confirmations = options?.confirmations ?? this.config.get('confirmations')

    this.assertHasAccount(account)

    return account.getBalance(assetId, confirmations)
  }

  private async *getUnspentNotes(
    account: Account,
    assetId: Buffer,
    options?: {
      confirmations?: number
    },
  ): AsyncGenerator<DecryptedNoteValue> {
    const confirmations = options?.confirmations ?? this.config.get('confirmations')

    for await (const decryptedNote of account.getUnspentNotes(assetId, {
      confirmations,
    })) {
      yield decryptedNote
    }
  }

  async send(options: {
    account: Account
    outputs: TransactionOutput[]
    fee?: bigint
    feeRate?: bigint
    expirationDelta?: number
    expiration?: number
    confirmations?: number
  }): Promise<Transaction> {
    const raw = await this.createTransaction({
      account: options.account,
      outputs: options.outputs,
      fee: options.fee,
      feeRate: options.feeRate,
      expirationDelta: options.expirationDelta,
      expiration: options.expiration ?? undefined,
      confirmations: options.confirmations ?? undefined,
    })

    const { transaction } = await this.post({
      transaction: raw,
      account: options.account,
    })
    return transaction
  }

  async mint(account: Account, options: MintAssetOptions): Promise<Transaction> {
    let mintData: MintData

    if ('assetId' in options) {
      const asset = await this.getChainAsset(options.assetId)
      if (!asset) {
        throw new Error(
          `Asset not found. Cannot mint for identifier '${options.assetId.toString('hex')}'`,
        )
      }

      mintData = {
        creator: asset.creator.toString('hex'),
        name: asset.name.toString('utf8'),
        metadata: asset.metadata.toString('utf8'),
        value: options.value,
      }
    } else {
      mintData = {
        creator: account.publicAddress,
        name: options.name,
        metadata: options.metadata,
        value: options.value,
      }
    }

    const raw = await this.createTransaction({
      account,
      mints: [mintData],
      fee: options.fee,
      feeRate: options.feeRate,
      expirationDelta: options.expirationDelta,
      expiration: options.expiration,
      confirmations: options.confirmations,
    })

    const { transaction } = await this.post({
      transaction: raw,
      account,
    })
    return transaction
  }

  async burn(
    account: Account,
    assetId: Buffer,
    value: bigint,
    expirationDelta: number,
    fee?: bigint,
    feeRate?: bigint,
    expiration?: number,
    confirmations?: number,
  ): Promise<Transaction> {
    const raw = await this.createTransaction({
      account,
      burns: [{ assetId, value }],
      fee,
      feeRate,
      expirationDelta,
      expiration,
      confirmations,
    })

    const { transaction } = await this.post({
      transaction: raw,
      account,
    })
    return transaction
  }

  async createTransaction(options: {
    account: Account
    notes?: Buffer[]
    outputs?: TransactionOutput[]
    mints?: MintData[]
    burns?: BurnDescription[]
    fee?: bigint
    feeRate?: bigint
    expiration?: number
    expirationDelta?: number
    confirmations?: number
  }): Promise<RawTransaction> {
    const heaviestHead = await this.getChainHead()
    if (heaviestHead === null) {
      throw new Error('You must have a genesis block to create a transaction')
    }

    if (options.fee === undefined && options.feeRate === undefined) {
      throw new Error('Fee or FeeRate is required to create a transaction')
    }

    const confirmations = options.confirmations ?? this.config.get('confirmations')

    const expirationDelta =
      options.expirationDelta ?? this.config.get('transactionExpirationDelta')

    const expiration = options.expiration ?? heaviestHead.sequence + expirationDelta

    if (isExpiredSequence(expiration, heaviestHead.sequence)) {
      throw new Error(
        `Invalid expiration sequence for transaction ${expiration} vs ${heaviestHead.sequence}`,
      )
    }

    const unlock = await this.createTransactionMutex.lock()

    try {
      this.assertHasAccount(options.account)

      if (!(await this.isAccountUpToDate(options.account))) {
        throw new Error('Your account must finish scanning before sending a transaction.')
      }

      const transactionVersionSequenceDelta = TransactionUtils.versionSequenceDelta(
        expiration ? expiration - heaviestHead.sequence : expiration,
      )
      const transactionVersion = this.consensus.getActiveTransactionVersion(
        heaviestHead.sequence + transactionVersionSequenceDelta,
      )
      const raw = new RawTransaction(transactionVersion)
      raw.expiration = expiration

      if (options.mints) {
        raw.mints = options.mints
      }

      if (options.burns) {
        raw.burns = options.burns
      }

      if (options.outputs) {
        for (const output of options.outputs) {
          const note = new NativeNote(
            output.publicAddress,
            output.amount,
            output.memo,
            output.assetId,
            options.account.publicAddress,
          )

          raw.outputs.push({ note: new Note(note.serialize()) })
        }
      }

      if (options.fee != null) {
        raw.fee = options.fee
      }

      if (options.feeRate) {
        raw.fee = getFee(options.feeRate, raw.postedSize(options.account.publicAddress))
      }

      await this.fund(raw, {
        account: options.account,
        notes: options.notes,
        confirmations: confirmations,
      })

      if (options.feeRate) {
        raw.fee = getFee(options.feeRate, raw.postedSize(options.account.publicAddress))
        raw.spends = []

        await this.fund(raw, {
          account: options.account,
          notes: options.notes,
          confirmations: confirmations,
        })
      }

      return raw
    } finally {
      unlock()
    }
  }

  async post(options: {
    transaction: RawTransaction
    spendingKey?: string
    account?: Account
    broadcast?: boolean
  }): Promise<{
    transaction: Transaction
    accepted?: boolean
    broadcasted?: boolean
  }> {
    const broadcast = options.broadcast ?? true

    const spendingKey = options.account?.spendingKey ?? options.spendingKey
    Assert.isTruthy(spendingKey, `Spending key is required to post transaction`)

    const transaction = await this.workerPool.postTransaction(options.transaction, spendingKey)

    const verify = Verifier.verifyCreatedTransaction(transaction, this.consensus)

    if (!verify.valid) {
      throw new Error(`Invalid transaction, reason: ${String(verify.reason)}`)
    }

    let accepted
    let broadcasted
    if (broadcast) {
      await this.addPendingTransaction(transaction)
      ;({ accepted, broadcasted } = await this.broadcastTransaction(transaction))
    }

    return { accepted, broadcasted, transaction }
  }

  async fund(
    raw: RawTransaction,
    options: {
      account: Account
      notes?: Buffer[]
      confirmations: number
    },
  ): Promise<void> {
    const needed = this.buildAmountsNeeded(raw, { fee: raw.fee })
    const spent = new BufferMap<bigint>()
    const notesSpent = new BufferMap<BufferSet>()

    for (const noteHash of options.notes ?? []) {
      const decryptedNote = await options.account.getDecryptedNote(noteHash)
      Assert.isNotUndefined(
        decryptedNote,
        `No note found with hash ${noteHash.toString('hex')} for account ${
          options.account.name
        }`,
      )

      const witness = await this.getNoteWitness(decryptedNote, options.confirmations)

      const assetId = decryptedNote.note.assetId()

      const assetAmountSpent = spent.get(assetId) ?? 0n
      spent.set(assetId, assetAmountSpent + decryptedNote.note.value())

      const assetNotesSpent = notesSpent.get(assetId) ?? new BufferSet()
      assetNotesSpent.add(noteHash)
      notesSpent.set(assetId, assetNotesSpent)

      raw.spends.push({ note: decryptedNote.note, witness })
    }

    for (const [assetId, assetAmountNeeded] of needed.entries()) {
      const assetAmountSpent = spent.get(assetId) ?? 0n
      const assetNotesSpent = notesSpent.get(assetId) ?? new BufferSet()

      if (assetAmountSpent >= assetAmountNeeded) {
        continue
      }

      const amountSpent = await this.addSpendsForAsset(
        raw,
        options.account,
        assetId,
        assetAmountNeeded,
        assetAmountSpent,
        assetNotesSpent,
        options.confirmations,
      )

      if (amountSpent < assetAmountNeeded) {
        throw new NotEnoughFundsError(assetId, amountSpent, assetAmountNeeded)
      }
    }
  }

  async getNoteWitness(
    note: DecryptedNoteValue,
    confirmations?: number,
  ): Promise<Witness<NoteEncrypted, Buffer, Buffer, Buffer>> {
    Assert.isNotNull(
      note.index,
      `Note with hash ${note.note
        .hash()
        .toString('hex')} is missing an index and cannot be spent.`,
    )

    Assert.isNotNull(this.nodeClient)
    const response = await this.nodeClient.chain.getNoteWitness({
      index: note.index,
      confirmations: confirmations ?? this.config.get('confirmations'),
    })
    const witness = new Witness(
      response.content.treeSize,
      Buffer.from(response.content.rootHash, 'hex'),
      response.content.authPath.map((node) => ({
        hashOfSibling: Buffer.from(node.hashOfSibling, 'hex'),
        side: node.side === 'Left' ? Side.Left : Side.Right,
      })),
      new NoteHasher(),
    )

    Assert.isNotNull(
      witness,
      `Could not create a witness for note with hash ${note.note.hash().toString('hex')}`,
    )

    return witness
  }

  private buildAmountsNeeded(
    raw: RawTransaction,
    options: {
      fee: bigint
    },
  ): BufferMap<bigint> {
    const amountsNeeded = new BufferMap<bigint>()
    amountsNeeded.set(Asset.nativeId(), options.fee)

    for (const output of raw.outputs) {
      const currentAmount = amountsNeeded.get(output.note.assetId()) ?? 0n
      amountsNeeded.set(output.note.assetId(), currentAmount + output.note.value())
    }

    for (const burn of raw.burns) {
      const currentAmount = amountsNeeded.get(burn.assetId) ?? 0n
      amountsNeeded.set(burn.assetId, currentAmount + burn.value)
    }

    return amountsNeeded
  }

  async addSpendsForAsset(
    raw: RawTransaction,
    sender: Account,
    assetId: Buffer,
    amountNeeded: bigint,
    amountSpent: bigint,
    notesSpent: BufferSet,
    confirmations: number,
  ): Promise<bigint> {
    for await (const unspentNote of sender.getUnspentNotes(assetId, {
      confirmations,
    })) {
      if (notesSpent.has(unspentNote.note.hash())) {
        continue
      }

      const witness = await this.getNoteWitness(unspentNote, confirmations)

      amountSpent += unspentNote.note.value()

      raw.spends.push({ note: unspentNote.note, witness })

      if (amountSpent >= amountNeeded) {
        break
      }
    }

    return amountSpent
  }

  async broadcastTransaction(
    transaction: Transaction,
  ): Promise<{ accepted: boolean; broadcasted: boolean }> {
    try {
      Assert.isNotNull(this.nodeClient)
      const response = await this.nodeClient.chain.broadcastTransaction({
        transaction: transaction.serialize().toString('hex'),
      })
      Assert.isNotNull(response.content)

      return { accepted: response.content.accepted, broadcasted: response.content.broadcasted }
    } catch (e: unknown) {
      this.logger.warn(
        `Failed to broadcast transaction ${transaction
          .hash()
          .toString('hex')}: ${ErrorUtils.renderError(e)}`,
      )

      return { accepted: false, broadcasted: false }
    }
  }

  async rebroadcastTransactions(sequence: number): Promise<void> {
    for (const account of this.accounts.values()) {
      if (this.eventLoopAbortController.signal.aborted) {
        return
      }

      for await (const transactionInfo of account.getPendingTransactions(sequence)) {
        if (this.eventLoopAbortController.signal.aborted) {
          return
        }

        const { transaction, blockHash, submittedSequence } = transactionInfo
        const transactionHash = transaction.hash()

        // Skip transactions that are already added to a block
        if (blockHash) {
          continue
        }

        // TODO: This algorithm suffers a deanonymization attack where you can
        // watch to see what transactions node continuously send out, then you can
        // know those transactions are theres. This should be randomized and made
        // less, predictable later to help prevent that attack.
        if (sequence - submittedSequence < this.rebroadcastAfter) {
          continue
        }

        await this.walletDb.db.transaction(async (tx) => {
          await this.walletDb.saveTransaction(
            account,
            transactionHash,
            {
              ...transactionInfo,
              submittedSequence: sequence,
            },
            tx,
          )
        })

        await this.broadcastTransaction(transaction)
      }
    }
  }

  async expireTransactions(sequence: number): Promise<void> {
    for (const account of this.accounts.values()) {
      if (this.eventLoopAbortController.signal.aborted) {
        return
      }

      for await (const { transaction } of account.getExpiredTransactions(sequence)) {
        if (this.eventLoopAbortController.signal.aborted) {
          return
        }

        await account.expireTransaction(transaction)
      }
    }
  }

  async getTransactionStatus(
    account: Account,
    transaction: TransactionValue,
    options?: {
      headSequence?: number | null
      confirmations?: number
    },
    tx?: IDatabaseTransaction,
  ): Promise<TransactionStatus> {
    const confirmations = options?.confirmations ?? this.config.get('confirmations')

    const headSequence = options?.headSequence ?? (await account.getHead(tx))?.sequence

    if (!headSequence) {
      return TransactionStatus.UNKNOWN
    }

    if (transaction.sequence) {
      const isConfirmed =
        transaction.sequence === GENESIS_BLOCK_SEQUENCE ||
        headSequence - transaction.sequence >= confirmations

      return isConfirmed ? TransactionStatus.CONFIRMED : TransactionStatus.UNCONFIRMED
    } else {
      const isExpired = isExpiredSequence(transaction.transaction.expiration(), headSequence)

      return isExpired ? TransactionStatus.EXPIRED : TransactionStatus.PENDING
    }
  }

  async getAssetStatus(
    account: Account,
    assetValue: AssetValue,
    options?: {
      headSequence?: number | null
      confirmations?: number
    },
  ): Promise<AssetStatus> {
    const confirmations = options?.confirmations ?? this.config.get('confirmations')

    const headSequence = options?.headSequence ?? (await account.getHead())?.sequence
    if (!headSequence) {
      return AssetStatus.UNKNOWN
    }

    if (assetValue.sequence) {
      const confirmed = headSequence - assetValue.sequence >= confirmations
      return confirmed ? AssetStatus.CONFIRMED : AssetStatus.UNCONFIRMED
    }

    return AssetStatus.PENDING
  }

  async getTransactionType(
    account: Account,
    transaction: TransactionValue,
    tx?: IDatabaseTransaction,
  ): Promise<TransactionType> {
    if (transaction.transaction.isMinersFee()) {
      return TransactionType.MINER
    }

    for (const spend of transaction.transaction.spends) {
      if ((await account.getNoteHash(spend.nullifier, tx)) !== undefined) {
        return TransactionType.SEND
      }
    }

    for (const note of transaction.transaction.notes) {
      const decryptedNote = await account.getDecryptedNote(note.hash(), tx)

      if (!decryptedNote) {
        continue
      }

      if (decryptedNote.note.sender() === account.publicAddress) {
        return TransactionType.SEND
      }
    }

    return TransactionType.RECEIVE
  }

  async createAccount(
    name: string,
    options: { setCreatedAt?: boolean; setDefault?: boolean } = {
      setCreatedAt: true,
      setDefault: false,
    },
  ): Promise<Account> {
    if (this.getAccountByName(name)) {
      throw new Error(`Account already exists with the name ${name}`)
    }

    const key = generateKey()

    let createdAt: HeadValue | null = null
    if (options.setCreatedAt && this.nodeClient) {
      try {
        createdAt = await this.getChainHead()
      } catch {
        this.logger.warn('Failed to fetch chain head from node client')
      }
    }

    const account = new Account({
      version: ACCOUNT_SCHEMA_VERSION,
      id: uuid(),
      name,
      incomingViewKey: key.incomingViewKey,
      outgoingViewKey: key.outgoingViewKey,
      publicAddress: key.publicAddress,
      spendingKey: key.spendingKey,
      viewKey: key.viewKey,
      createdAt,
      walletDb: this.walletDb,
    })

    await this.walletDb.db.transaction(async (tx) => {
      await this.walletDb.setAccount(account, tx)
      await account.updateHead(createdAt, tx)
    })

    // If this is the first account, set the chainProcessor state
    if (this.accounts.size === 0 && createdAt) {
      this.chainProcessor.hash = createdAt.hash
      this.chainProcessor.sequence = createdAt.sequence
    }

    this.accounts.set(account.id, account)

    if (options.setDefault) {
      await this.setDefaultAccount(account.name)
    }

    return account
  }

  async skipRescan(account: Account, tx?: IDatabaseTransaction): Promise<void> {
    const hash = this.chainProcessor.hash
    const sequence = this.chainProcessor.sequence

    if (hash === null || sequence === null) {
      await account.updateHead(null, tx)
    } else {
      await account.updateHead({ hash, sequence }, tx)
    }
  }

  async importAccount(accountValue: AccountValue): Promise<Account> {
    if (accountValue.name && this.getAccountByName(accountValue.name)) {
      throw new Error(`Account already exists with the name ${accountValue.name}`)
    }
    const accounts = this.listAccounts()
    if (
      accountValue.spendingKey &&
      accounts.find((a) => accountValue.spendingKey === a.spendingKey)
    ) {
      throw new Error(`Account already exists with provided spending key`)
    }
    if (accounts.find((a) => accountValue.viewKey === a.viewKey)) {
      throw new Error(`Account already exists with provided view key(s)`)
    }

    validateAccount(accountValue)

    let createdAt = accountValue.createdAt

    if (createdAt && !this.nodeClient) {
      this.logger.debug(
        `Wallet not connected to node to verify that account createdAt block ${createdAt.hash.toString(
          'hex',
        )} (${createdAt.sequence}) in chain. Setting createdAt to null`,
      )
      createdAt = null
    }

    if (createdAt !== null && !(await this.chainHasBlock(createdAt.hash))) {
      this.logger.debug(
        `Account ${accountValue.name} createdAt block ${createdAt.hash.toString('hex')} (${
          createdAt.sequence
        }) not found in the chain. Setting createdAt to null.`,
      )
      createdAt = null
    }

    const account = new Account({
      ...accountValue,
      createdAt,
      walletDb: this.walletDb,
    })

    await this.walletDb.db.transaction(async (tx) => {
      await this.walletDb.setAccount(account, tx)
      await account.updateHead(null, tx)
    })

    this.accounts.set(account.id, account)
    this.onAccountImported.emit(account)

    return account
  }

  listAccounts(): Account[] {
    return Array.from(this.accounts.values())
  }

  accountExists(name: string): boolean {
    return this.getAccountByName(name) !== null
  }

  async resetAccount(
    account: Account,
    options?: {
      resetCreatedAt?: boolean
      tx?: IDatabaseTransaction
    },
  ): Promise<void> {
    const newAccount = new Account({
      ...account,
      createdAt: options?.resetCreatedAt ? null : account.createdAt,
      id: uuid(),
      walletDb: this.walletDb,
    })

    await this.walletDb.db.withTransaction(options?.tx, async (tx) => {
      await this.walletDb.setAccount(newAccount, tx)
      await newAccount.updateHead(null, tx)

      if (account.id === this.defaultAccount) {
        await this.walletDb.setDefaultAccount(newAccount.id, tx)
        this.defaultAccount = newAccount.id
      }

      this.accounts.set(newAccount.id, newAccount)

      await this.removeAccount(account, tx)
    })
  }

  async removeAccountByName(name: string): Promise<void> {
    const account = this.getAccountByName(name)
    if (!account) {
      return
    }

    await this.removeAccount(account)
  }

  async removeAccount(account: Account, tx?: IDatabaseTransaction): Promise<void> {
    await this.walletDb.db.withTransaction(tx, async (tx) => {
      if (account.id === this.defaultAccount) {
        await this.walletDb.setDefaultAccount(null, tx)
        this.defaultAccount = null
      }

      await this.walletDb.removeAccount(account, tx)
      await this.walletDb.removeHead(account, tx)
    })

    this.accounts.delete(account.id)
    this.onAccountRemoved.emit(account)
  }

  async forceCleanupDeletedAccounts(): Promise<void> {
    await this.walletDb.forceCleanupDeletedAccounts(this.eventLoopAbortController.signal)
  }

  async cleanupDeletedAccounts(): Promise<void> {
    if (!this.isStarted) {
      return
    }

    if (this.scan || this.updateHeadState) {
      return
    }

    const recordsToCleanup = 1000
    await this.walletDb.cleanupDeletedAccounts(
      recordsToCleanup,
      this.eventLoopAbortController.signal,
    )
  }

  get hasDefaultAccount(): boolean {
    return !!this.defaultAccount
  }

  /** Set or clear the default account */
  async setDefaultAccount(name: string | null, tx?: IDatabaseTransaction): Promise<void> {
    let next = null

    if (name) {
      next = this.getAccountByName(name)

      if (!next) {
        throw new Error(`No account found with name ${name}`)
      }

      if (this.defaultAccount === next.id) {
        return
      }
    }

    const nextId = next ? next.id : null
    await this.walletDb.setDefaultAccount(nextId, tx)
    this.defaultAccount = nextId
  }

  getAccountByName(name: string): Account | null {
    for (const account of this.accounts.values()) {
      if (name === account.name) {
        return account
      }
    }
    return null
  }

  getAccount(id: string): Account | null {
    const account = this.accounts.get(id)

    if (account) {
      return account
    }

    return null
  }

  getDefaultAccount(): Account | null {
    if (!this.defaultAccount) {
      return null
    }

    return this.getAccount(this.defaultAccount)
  }

  async getEarliestHeadHash(): Promise<Buffer | null> {
    let earliestHead = null
    for (const account of this.accounts.values()) {
      const head = await account.getHead()

      if (!head) {
        return null
      }

      if (!earliestHead || earliestHead.sequence > head.sequence) {
        earliestHead = head
      }
    }

    return earliestHead ? earliestHead.hash : null
  }

  async getLatestHead(): Promise<HeadValue | null> {
    let latestHead = null

    for (const account of this.accounts.values()) {
      const head = await account.getHead()

      if (!head) {
        continue
      }

      if (!latestHead || latestHead.sequence < head.sequence) {
        latestHead = head
      }
    }

    return latestHead
  }

  async getLatestHeadHash(): Promise<Buffer | null> {
    const latestHead = await this.getLatestHead()

    return latestHead ? latestHead.hash : null
  }

  async isAccountUpToDate(account: Account): Promise<boolean> {
    const head = await account.getHead()
    Assert.isNotUndefined(
      head,
      `isAccountUpToDate: No head hash found for account ${account.displayName}`,
    )

    return BufferUtils.equalsNullable(head?.hash ?? null, this.chainProcessor.hash)
  }

  protected assertHasAccount(account: Account): void {
    if (!this.accountExists(account.name)) {
      throw new Error(`No account found with name ${account.name}`)
    }
  }

  protected assertNotHasAccount(account: Account): void {
    if (this.accountExists(account.name)) {
      throw new Error(`No account found with name ${account.name}`)
    }
  }

  async chainHasBlock(hash: Buffer): Promise<boolean> {
    return (await this.chainGetBlock({ hash: hash.toString('hex') })) !== null
  }

  async chainGetBlock(request: GetBlockRequest): Promise<GetBlockResponse | null> {
    try {
      Assert.isNotNull(this.nodeClient)
      return (await this.nodeClient.chain.getBlock(request)).content
    } catch (error: unknown) {
      if (ErrorUtils.isNotFoundError(error)) {
        return null
      }

      this.logger.error(ErrorUtils.renderError(error, true))
      throw error
    }
  }

  private async getChainAsset(id: Buffer): Promise<{
    createdTransactionHash: Buffer
    creator: Buffer
    owner: Buffer
    id: Buffer
    metadata: Buffer
    name: Buffer
    nonce: number
  } | null> {
    try {
      Assert.isNotNull(this.nodeClient)
      const response = await this.nodeClient.chain.getAsset({ id: id.toString('hex') })
      return {
        createdTransactionHash: Buffer.from(response.content.createdTransactionHash, 'hex'),
        creator: Buffer.from(response.content.creator, 'hex'),
        owner: Buffer.from(response.content.owner, 'hex'),
        id: Buffer.from(response.content.id, 'hex'),
        metadata: Buffer.from(response.content.metadata, 'hex'),
        name: Buffer.from(response.content.name, 'hex'),
        nonce: response.content.nonce,
      }
    } catch (error: unknown) {
      if (ErrorUtils.isNotFoundError(error)) {
        return null
      }

      this.logger.error(ErrorUtils.renderError(error, true))
      throw error
    }
  }

  private async getChainHead(): Promise<{ hash: Buffer; sequence: number }> {
    try {
      Assert.isNotNull(this.nodeClient)
      const response = await this.nodeClient.chain.getChainInfo()
      return {
        hash: Buffer.from(response.content.oldestBlockIdentifier.hash, 'hex'),
        sequence: Number(response.content.oldestBlockIdentifier.index),
      }
    } catch (error: unknown) {
      this.logger.error(ErrorUtils.renderError(error, true))
      throw error
    }
  }
}

export class ScanState {
  onTransaction = new Event<[sequence: number, endSequence: number]>()

  sequence = -1
  endSequence = -1

  readonly startedAt: number
  readonly abortController: AbortController
  private runningPromise: Promise<void>
  private runningResolve: PromiseResolve<void>

  constructor() {
    const [promise, resolve] = PromiseUtils.split<void>()
    this.runningPromise = promise
    this.runningResolve = resolve

    this.abortController = new AbortController()
    this.startedAt = Date.now()
  }

  get isAborted(): boolean {
    return this.abortController.signal.aborted
  }

  signal(sequence: number): void {
    this.sequence = sequence
    this.onTransaction.emit(sequence, this.endSequence)
  }

  signalComplete(): void {
    this.runningResolve()
  }

  async abort(): Promise<void> {
    this.abortController.abort()
    return this.wait()
  }

  wait(): Promise<void> {
    return this.runningPromise
  }
}
