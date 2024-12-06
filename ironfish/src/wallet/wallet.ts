/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { Blockchain } from '../blockchain'
import {
  Asset,
  generateKey,
  MEMO_LENGTH,
  multisig,
  Note as NativeNote,
  UnsignedTransaction,
} from '@ironfish/rust-nodejs'
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
import { BlockHeader } from '../primitives'
import { GENESIS_BLOCK_SEQUENCE } from '../primitives/block'
import { BurnDescription } from '../primitives/burnDescription'
import { MintDescription } from '../primitives/mintDescription'
import { Note } from '../primitives/note'
import { NoteEncrypted } from '../primitives/noteEncrypted'
import { MintData, RawTransaction } from '../primitives/rawTransaction'
import { SPEND_SERIALIZED_SIZE_IN_BYTE } from '../primitives/spend'
import { Transaction } from '../primitives/transaction'
import { GetBlockRequest, GetBlockResponse, RpcClient } from '../rpc'
import { IDatabaseTransaction } from '../storage/database/transaction'
import {
  AsyncUtils,
  ErrorUtils,
  PromiseUtils,
  SetTimeoutToken,
  TransactionUtils,
} from '../utils'
import { WorkerPool } from '../workerPool'
import { DecryptedNote, DecryptNotesItem } from '../workerPool/tasks/decryptNotes'
import { DecryptNotesOptions } from '../workerPool/tasks/decryptNotes'
import { Account, ACCOUNT_SCHEMA_VERSION } from './account/account'
import { EncryptedAccount } from './account/encryptedAccount'
import { AssetBalances } from './assetBalances'
import {
  DuplicateAccountNameError,
  DuplicateMultisigSecretNameError,
  DuplicateSpendingKeyError,
  MaxMemoLengthError,
  MaxTransactionSizeError,
  NotEnoughFundsError,
} from './errors'
import { isMultisigSignerImport } from './exporter'
import { AccountImport, validateAccountImport } from './exporter/accountImport'
import {
  isMultisigHardwareSignerImport,
  isMultisigSignerTrustedDealerImport,
} from './exporter/multisig'
import { MintAssetOptions } from './interfaces/mintAssetOptions'
import { MasterKey } from './masterKey'
import { ScanState } from './scanner/scanState'
import { WalletScanner } from './scanner/walletScanner'
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
  memo: Buffer
  assetId: Buffer
}

export const DEFAULT_UNLOCK_TIMEOUT_MS = 24 * 60 * 60 * 1000

export class Wallet {
  readonly onAccountImported = new Event<[account: Account]>()
  readonly onAccountRemoved = new Event<[account: Account]>()

  readonly accountById = new Map<string, Account>()
  readonly encryptedAccountById = new Map<string, EncryptedAccount>()
  readonly walletDb: WalletDB
  private readonly logger: Logger
  readonly workerPool: WorkerPool
  readonly scanner: WalletScanner
  readonly nodeClient: RpcClient | null
  private readonly config: Config
  private readonly consensus: Consensus
  readonly networkId: number
  private masterKey: MasterKey | null

  protected rebroadcastAfter: number
  protected defaultAccount: string | null = null
  protected isStarted = false
  protected isOpen = false
  protected isSyncingTransactionGossip = false
  locked: boolean
  protected eventLoopTimeout: SetTimeoutToken | null = null
  protected lockTimeout: SetTimeoutToken | null
  private readonly createTransactionMutex: Mutex
  private readonly eventLoopAbortController: AbortController
  private eventLoopPromise: Promise<void> | null = null

  constructor({
    config,
    database,
    logger = createRootLogger(),
    rebroadcastAfter,
    workerPool,
    consensus,
    networkId,
    nodeClient,
    chain,
  }: {
    config: Config
    database: WalletDB
    logger?: Logger
    rebroadcastAfter?: number
    workerPool: WorkerPool
    consensus: Consensus
    networkId: number
    nodeClient: RpcClient | null
    chain: Blockchain | null
  }) {
    this.config = config
    this.logger = logger.withTag('accounts')
    this.walletDb = database
    this.workerPool = workerPool
    this.consensus = consensus
    this.networkId = networkId
    this.nodeClient = nodeClient || null
    this.rebroadcastAfter = rebroadcastAfter ?? 10
    this.locked = false
    this.lockTimeout = null
    this.masterKey = null
    this.createTransactionMutex = new Mutex()
    this.eventLoopAbortController = new AbortController()

    this.scanner = new WalletScanner({
      wallet: this,
      workerPool: this.workerPool,
      logger: this.logger,
      config: this.config,
      nodeClient: this.nodeClient,
      chain: chain,
    })
  }

  /**
   * This starts a scan and returns when the scan has started and does not wait
   * for it to complete.
   */
  async scan({
    force,
    wait,
  }: {
    force?: boolean
    wait?: boolean
  } = {}): Promise<ScanState | null> {
    wait = wait ?? true

    Assert.isTrue(this.isOpen, 'Cannot start a scan if wallet is not loaded')

    if (!this.config.get('enableWallet')) {
      return null
    }

    if (this.accounts.length === 0) {
      return null
    }

    if (this.scanner.running && !force) {
      this.logger.debug('Skipping Scan, already scanning.')
      return null
    }

    if (this.scanner.running && force) {
      this.logger.debug('Aborting scan in progress and starting new scan.')
      await this.scanner.abort()
    }

    const scan = await this.scanner.scan()

    if (wait) {
      await scan.wait()
    }

    return scan
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
    this.encryptedAccountById.clear()
    this.accountById.clear()
    this.masterKey = null

    const masterKeyValue = await this.walletDb.loadMasterKey()
    if (masterKeyValue) {
      this.masterKey = new MasterKey(masterKeyValue)
    }

    for await (const [id, accountValue] of this.walletDb.loadAccounts()) {
      if (accountValue.encrypted) {
        const encryptedAccount = new EncryptedAccount({
          walletDb: this.walletDb,
          accountValue,
        })
        this.encryptedAccountById.set(id, encryptedAccount)

        this.locked = true
      } else {
        const account = new Account({ accountValue, walletDb: this.walletDb })
        this.accountById.set(account.id, account)

        this.locked = false
      }
    }

    const meta = await this.walletDb.loadAccountsMeta()
    this.defaultAccount = meta.defaultAccountId
  }

  private unload(): void {
    this.encryptedAccountById.clear()
    this.accountById.clear()

    this.defaultAccount = null
  }

  async close(): Promise<void> {
    if (!this.isOpen) {
      return
    }

    this.isOpen = false
    await this.walletDb.close()
    this.unload()
  }

  start(): void {
    if (this.isStarted) {
      return
    }
    this.isStarted = true
    void this.eventLoop()
  }

  async stop(): Promise<void> {
    if (this.masterKey) {
      await this.masterKey.destroy()
    }

    this.stopUnlockTimeout()

    if (!this.isStarted) {
      return
    }
    this.isStarted = false

    if (this.eventLoopTimeout) {
      clearTimeout(this.eventLoopTimeout)
    }

    await this.scanner.abort()
    this.eventLoopAbortController.abort()
    await this.eventLoopPromise
  }

  async eventLoop(): Promise<void> {
    if (!this.isStarted) {
      return
    }

    const [promise, resolve] = PromiseUtils.split<void>()
    this.eventLoopPromise = promise

    if (!this.locked) {
      if (!this.scanner.running) {
        void this.scan()
      }

      void this.syncTransactionGossip()
      await this.cleanupDeletedAccounts()

      const head = await this.getLatestHead()

      if (head) {
        await this.expireTransactions(head.sequence)
        await this.rebroadcastTransactions(head.sequence)
      }
    }

    if (this.isStarted) {
      this.eventLoopTimeout = setTimeout(() => void this.eventLoop(), 1000)
    }

    resolve()
    this.eventLoopPromise = null
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

  async reset(
    options?: {
      resetCreatedAt?: boolean
      resetScanningEnabled?: boolean
      passphrase?: string
    },
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.resetAccounts(options, tx)
  }

  async resetAccounts(
    options?: {
      resetCreatedAt?: boolean
      resetScanningEnabled?: boolean
      passphrase?: string
    },
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    return this.walletDb.db.withTransaction(tx, async (tx) => {
      for (const account of this.accounts) {
        await this.resetAccount(account, options, tx)
      }
    })
  }

  async decryptNotes(
    transaction: Transaction,
    initialNoteIndex: number | null,
    decryptForSpender: boolean,
    accounts: ReadonlyArray<Account>,
  ): Promise<Map<string, Array<DecryptedNote>>> {
    const workloadSize = 20
    const notePromises: Array<Promise<Map<string, Array<DecryptedNote | undefined>>>> = []
    let decryptNotesPayloads = []

    let currentNoteIndex = initialNoteIndex

    for (const note of transaction.notes) {
      decryptNotesPayloads.push({
        serializedNote: note.serialize(),
        currentNoteIndex,
        decryptForSpender,
      })

      if (currentNoteIndex) {
        currentNoteIndex++
      }

      if (accounts.length * decryptNotesPayloads.length >= workloadSize) {
        notePromises.push(
          this.decryptNotesFromTransaction(accounts, decryptNotesPayloads, {
            decryptForSpender,
          }),
        )
        decryptNotesPayloads = []
      }
    }

    if (decryptNotesPayloads.length) {
      notePromises.push(
        this.decryptNotesFromTransaction(accounts, decryptNotesPayloads, {
          decryptForSpender,
        }),
      )
    }

    const mergedResults: Map<string, Array<DecryptedNote>> = new Map()
    for (const account of accounts) {
      mergedResults.set(account.id, [])
    }
    for (const promise of notePromises) {
      const partialResult = await promise
      for (const [accountId, decryptedNotes] of partialResult.entries()) {
        const list = mergedResults.get(accountId)
        Assert.isNotUndefined(list)
        list.push(
          ...(decryptedNotes.filter((note) => note !== undefined) as Array<DecryptedNote>),
        )
      }
    }

    return mergedResults
  }

  private decryptNotesFromTransaction(
    accounts: ReadonlyArray<Account>,
    encryptedNotes: Array<DecryptNotesItem>,
    options: DecryptNotesOptions,
  ): Promise<Map<string, Array<DecryptedNote | undefined>>> {
    const accountKeys = accounts.map((account) => ({
      accountId: account.id,
      incomingViewKey: Buffer.from(account.incomingViewKey, 'hex'),
      outgoingViewKey: Buffer.from(account.outgoingViewKey, 'hex'),
      viewKey: Buffer.from(account.viewKey, 'hex'),
    }))

    return this.workerPool.decryptNotes(accountKeys, encryptedNotes, options)
  }

  async connectBlockForAccount(
    account: Account,
    blockHeader: BlockHeader,
    transactions: { transaction: Transaction; decryptedNotes: DecryptedNote[] }[],
    shouldDecrypt: boolean,
  ): Promise<void> {
    let assetBalanceDeltas = new AssetBalances()

    await this.walletDb.db.transaction(async (tx) => {
      if (shouldDecrypt) {
        assetBalanceDeltas = await this.connectBlockTransactions(
          blockHeader,
          transactions,
          account,
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

  private async connectBlockTransactions(
    blockHeader: BlockHeader,
    transactions: Array<{ transaction: Transaction; decryptedNotes: Array<DecryptedNote> }>,
    account: Account,
    tx?: IDatabaseTransaction,
  ): Promise<AssetBalances> {
    const assetBalanceDeltas = new AssetBalances()

    for (const { transaction, decryptedNotes } of transactions) {
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
    blockHeader: BlockHeader,
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

  async disconnectBlockForAccount(
    account: Account,
    header: BlockHeader,
    transactions: Transaction[],
  ) {
    const assetBalanceDeltas = new AssetBalances()

    await this.walletDb.db.transaction(async (tx) => {
      for (const transaction of transactions.slice().reverse()) {
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
    })
  }

  async addPendingTransaction(transaction: Transaction): Promise<void> {
    const accounts = await AsyncUtils.filter(
      this.accounts,
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
    availableNoteCount: number
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
    availableNoteCount: number
    blockHash: Buffer | null
    sequence: number | null
  }> {
    const confirmations = options?.confirmations ?? this.config.get('confirmations')

    this.assertHasAccount(account)

    return account.getBalance(assetId, confirmations)
  }

  async send(options: {
    account: Account
    outputs: TransactionOutput[]
    fee?: bigint
    feeRate?: bigint
    expirationDelta?: number
    expiration?: number
    confirmations?: number
    notes?: Buffer[]
  }): Promise<Transaction> {
    const raw = await this.createTransaction({
      account: options.account,
      outputs: options.outputs,
      fee: options.fee,
      feeRate: options.feeRate,
      expirationDelta: options.expirationDelta,
      expiration: options.expiration ?? undefined,
      confirmations: options.confirmations ?? undefined,
      notes: options.notes,
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
        transferOwnershipTo: options.transferOwnershipTo,
      }
    } else {
      mintData = {
        creator: account.publicAddress,
        name: options.name,
        metadata: options.metadata,
        value: options.value,
        transferOwnershipTo: options.transferOwnershipTo,
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

    if (options.outputs) {
      for (const output of options.outputs) {
        if (output.memo.byteLength > MEMO_LENGTH) {
          throw new MaxMemoLengthError(output.memo)
        }
      }
    }

    const unlock = await this.createTransactionMutex.lock()

    try {
      this.assertHasAccount(options.account)

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
        raw.fee = getFee(options.feeRate, raw.postedSize())
      }

      await this.fund(raw, {
        account: options.account,
        notes: options.notes,
        confirmations: confirmations,
      })

      if (options.feeRate) {
        raw.fee = getFee(options.feeRate, raw.postedSize())
        raw.spends = []

        await this.fund(raw, {
          account: options.account,
          notes: options.notes,
          confirmations: confirmations,
        })
      }

      const maxTransactionSize = Verifier.getMaxTransactionBytes(
        this.consensus.parameters.maxBlockSizeBytes,
      )
      if (raw.postedSize() > maxTransactionSize) {
        throw new MaxTransactionSizeError(maxTransactionSize)
      }

      return raw
    } finally {
      unlock()
    }
  }

  async build(options: { transaction: RawTransaction; account: Account }): Promise<{
    transaction: UnsignedTransaction
  }> {
    Assert.isNotNull(
      options.account.proofAuthorizingKey,
      'proofAuthorizingKey is required to build transactions',
    )

    const transaction = await this.workerPool.buildTransaction(
      options.transaction,
      options.account.proofAuthorizingKey,
      options.account.viewKey,
      options.account.outgoingViewKey,
    )

    return { transaction }
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
    let postedSize = raw.postedSize()
    const maxTransactionSize = Verifier.getMaxTransactionBytes(
      this.consensus.parameters.maxBlockSizeBytes,
    )

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

      postedSize += SPEND_SERIALIZED_SIZE_IN_BYTE
      if (postedSize > maxTransactionSize) {
        throw new MaxTransactionSizeError(maxTransactionSize)
      }
    }

    for (const [assetId, assetAmountNeeded] of needed.entries()) {
      let assetAmountSpent = spent.get(assetId) ?? 0n
      const assetNotesSpent = notesSpent.get(assetId) ?? new BufferSet()

      if (assetAmountSpent >= assetAmountNeeded) {
        continue
      }

      for await (const unspentNote of options.account.getUnspentNotes(assetId, {
        reverse: true,
        confirmations: options.confirmations,
      })) {
        if (assetNotesSpent.has(unspentNote.note.hash())) {
          continue
        }

        const witness = await this.getNoteWitness(unspentNote, options.confirmations)

        assetAmountSpent += unspentNote.note.value()

        raw.spends.push({ note: unspentNote.note, witness })

        postedSize += SPEND_SERIALIZED_SIZE_IN_BYTE
        if (postedSize > maxTransactionSize) {
          throw new MaxTransactionSizeError(maxTransactionSize)
        }

        if (assetAmountSpent >= assetAmountNeeded) {
          break
        }
      }

      if (assetAmountSpent < assetAmountNeeded) {
        throw new NotEnoughFundsError(assetId, assetAmountSpent, assetAmountNeeded)
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

    for (const mint of raw.mints) {
      const asset = new Asset(mint.creator, mint.name, mint.metadata)
      const currentAmount = amountsNeeded.get(asset.id()) ?? 0n
      amountsNeeded.set(asset.id(), currentAmount - mint.value)
    }

    return amountsNeeded
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
    for (const account of this.accountById.values()) {
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
    for (const account of this.accountById.values()) {
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

  /**
   * Delete a transaction from all accounts in the wallet if it has not yet been
   * added to a block
   */
  async deleteTransaction(hash: Buffer, tx?: IDatabaseTransaction): Promise<boolean> {
    let deleted = false

    await this.walletDb.db.withTransaction(tx, async (tx) => {
      for (const account of this.accountById.values()) {
        const transactionValue = await account.getTransaction(hash, tx)

        if (transactionValue == null) {
          continue
        }

        const transactionStatus = await this.getTransactionStatus(
          account,
          transactionValue,
          undefined,
          tx,
        )

        if (
          transactionStatus === TransactionStatus.CONFIRMED ||
          transactionStatus === TransactionStatus.UNCONFIRMED
        ) {
          return false
        }

        if (
          transactionStatus === TransactionStatus.EXPIRED ||
          transactionStatus === TransactionStatus.PENDING
        ) {
          await account.deleteTransaction(transactionValue.transaction, tx)
          deleted = true
        }
      }
    })

    return deleted
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

  /**
   * Note: This logic will be deprecated when we move the field `status` from the Asset response object. The status field has
   * more to do with the transaction than the asset itself.
   *
   * The getTransactionStatus field above is more relevant.
   *
   * @param account Account
   * @param assetValue AssetValue
   * @param options: { headSequence?: number | null;  confirmations?: number}
   * @returns Promise<AssetStatus>
   */
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
    options: { setDefault?: boolean; createdAt?: number | null; head?: HeadValue | null } = {
      setDefault: false,
    },
  ): Promise<Account> {
    if (!name.trim()) {
      throw new Error('Account name cannot be blank')
    }

    if (this.getAccountByName(name)) {
      throw new DuplicateAccountNameError(name)
    }

    const key = generateKey()

    const createdAt = await this.createdAtWithDefault(options.createdAt)
    let accountHead: HeadValue | null
    if (options.head === undefined) {
      accountHead = createdAt && (await this.accountHeadAtSequence(createdAt.sequence))
    } else {
      accountHead = options.head
    }

    const account = new Account({
      accountValue: {
        encrypted: false,
        version: ACCOUNT_SCHEMA_VERSION,
        id: uuid(),
        name,
        incomingViewKey: key.incomingViewKey,
        outgoingViewKey: key.outgoingViewKey,
        proofAuthorizingKey: key.proofAuthorizingKey,
        publicAddress: key.publicAddress,
        spendingKey: key.spendingKey,
        viewKey: key.viewKey,
        scanningEnabled: true,
        createdAt,
        ledger: false,
      },
      walletDb: this.walletDb,
    })

    await this.walletDb.db.transaction(async (tx) => {
      const accountsEncrypted = await this.walletDb.accountsEncrypted(tx)

      if (accountsEncrypted) {
        Assert.isNotNull(this.masterKey)
        const encryptedAccount = await this.walletDb.setEncryptedAccount(
          account,
          this.masterKey,
          tx,
        )
        this.encryptedAccountById.set(account.id, encryptedAccount)
      } else {
        await this.walletDb.setAccount(account, tx)
      }

      await account.updateHead(accountHead, tx)
    })

    this.accountById.set(account.id, account)

    if (options.setDefault) {
      await this.setDefaultAccount(account.name)
    }

    return account
  }

  /*
   * Use createdAt if provided, otherwise use the current chain head
   */
  private async createdAtWithDefault(createdAt?: number | null): Promise<HeadValue | null> {
    if (createdAt === null) {
      return null
    }

    if (createdAt === undefined) {
      try {
        const sequence = (await this.getChainHead()).sequence
        return {
          sequence,
          hash: Buffer.alloc(32, 0),
        }
      } catch {
        this.logger.warn('Failed to fetch chain head from node client')
        return null
      }
    }

    return {
      sequence: createdAt,
      hash: Buffer.alloc(32, 0),
    }
  }

  /*
   * Try to get the block hash from the chain with createdAt sequence
   * Otherwise, return null
   */
  async accountHeadAtSequence(sequence: number): Promise<HeadValue | null> {
    try {
      const previousBlock = await this.chainGetBlock({ sequence })
      return previousBlock
        ? {
            hash: Buffer.from(previousBlock.block.hash, 'hex'),
            sequence: previousBlock.block.sequence,
          }
        : null
    } catch {
      this.logger.warn(`Failed to fetch block ${sequence} from node client`)
      return null
    }
  }

  async skipRescan(account: Account, tx?: IDatabaseTransaction): Promise<void> {
    const { hash, sequence } = await this.getChainHead()
    await account.updateHead({ hash, sequence }, tx)
  }

  async importAccount(
    accountValue: AccountImport,
    options?: { createdAt?: number },
  ): Promise<Account> {
    let multisigKeys = undefined
    let secret: Buffer | undefined
    let identity: Buffer | undefined
    const name = accountValue.name

    if (accountValue.multisigKeys) {
      multisigKeys = accountValue.multisigKeys

      if (isMultisigSignerTrustedDealerImport(accountValue.multisigKeys)) {
        const multisigIdentity = await this.walletDb.getMultisigIdentity(
          Buffer.from(accountValue.multisigKeys.identity, 'hex'),
        )
        if (!multisigIdentity || !multisigIdentity.secret) {
          throw new Error('Cannot import identity without a corresponding multisig secret')
        }

        multisigKeys = {
          ...multisigKeys,
          secret: multisigIdentity.secret.toString('hex'),
        }
        secret = multisigIdentity.secret
        identity = Buffer.from(accountValue.multisigKeys.identity, 'hex')
      } else if (isMultisigSignerImport(accountValue.multisigKeys)) {
        secret = Buffer.from(accountValue.multisigKeys.secret, 'hex')
        // Derive identity from secret for backwards compatibility: legacy
        // MultisigKeysImport may not include identity
        identity = new multisig.ParticipantSecret(secret).toIdentity().serialize()
        multisigKeys = {
          ...multisigKeys,
          identity: identity.toString('hex'),
        }
      } else if (isMultisigHardwareSignerImport(accountValue.multisigKeys)) {
        identity = Buffer.from(accountValue.multisigKeys.identity, 'hex')
      }
    }

    if (name && this.getAccountByName(name)) {
      throw new DuplicateAccountNameError(name)
    }

    if (accountValue.spendingKey) {
      const duplicateSpendingAccount = this.accounts.find(
        (a) => accountValue.spendingKey === a.spendingKey,
      )

      if (duplicateSpendingAccount) {
        throw new DuplicateSpendingKeyError(duplicateSpendingAccount.name)
      }
    }

    validateAccountImport(accountValue)

    let createdAt = options?.createdAt
      ? {
          sequence: options?.createdAt,
          // hash is no longer used, set to empty buffer
          hash: Buffer.alloc(32, 0),
          networkId: this.networkId,
        }
      : accountValue.createdAt

    if (createdAt?.networkId !== this.networkId) {
      if (createdAt?.networkId !== undefined) {
        this.logger.warn(
          `Account ${accountValue.name} networkId ${createdAt?.networkId} does not match wallet networkId ${this.networkId}. Setting createdAt to null.`,
        )
      }
      createdAt = null
    }

    const account = new Account({
      accountValue: {
        ...accountValue,
        id: uuid(),
        createdAt,
        name,
        multisigKeys,
        scanningEnabled: true,
        encrypted: false,
      },
      walletDb: this.walletDb,
    })

    await this.walletDb.db.transaction(async (tx) => {
      const encrypted = await this.walletDb.accountsEncrypted(tx)

      if (encrypted) {
        Assert.isNotNull(this.masterKey)
        await this.walletDb.setEncryptedAccount(account, this.masterKey, tx)
      } else {
        await this.walletDb.setAccount(account, tx)
      }

      if (identity) {
        await this.walletDb.deleteMultisigIdentity(identity, tx)
      }

      const accountHead =
        createdAt && (await this.accountHeadAtSequence(createdAt.sequence - 1))

      await account.updateHead(accountHead, tx)
    })

    this.accountById.set(account.id, account)
    this.logger.debug(`Account ${account.id} imported successfully`)
    this.onAccountImported.emit(account)

    return account
  }

  async setName(account: Account, name: string, tx?: IDatabaseTransaction): Promise<void> {
    await account.setName(name, { masterKey: this.masterKey }, tx)
  }

  async setScanningEnabled(
    account: Account,
    enabled: boolean,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await account.updateScanningEnabled(enabled, { masterKey: this.masterKey }, tx)
  }

  get accounts(): Account[] {
    return Array.from(this.accountById.values())
  }

  get encryptedAccounts(): EncryptedAccount[] {
    return Array.from(this.encryptedAccountById.values())
  }

  accountExists(name: string): boolean {
    return this.getAccountByName(name) !== null
  }

  async resetAccount(
    account: Account,
    options?: {
      resetCreatedAt?: boolean
      resetScanningEnabled?: boolean
    },
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    const newAccount = new Account({
      accountValue: {
        ...account,
        createdAt: options?.resetCreatedAt ? null : account.createdAt,
        scanningEnabled: options?.resetScanningEnabled ? true : account.scanningEnabled,
        id: uuid(),
        encrypted: false,
      },
      walletDb: this.walletDb,
    })

    this.logger.debug(`Resetting account name: ${account.name}, id: ${account.id}`)

    await this.walletDb.db.withTransaction(tx, async (tx) => {
      const encrypted = await this.walletDb.accountsEncrypted(tx)

      if (encrypted) {
        Assert.isNotNull(this.masterKey)
        const encryptedAccount = await this.walletDb.setEncryptedAccount(
          newAccount,
          this.masterKey,
          tx,
        )
        this.encryptedAccountById.set(newAccount.id, encryptedAccount)
      } else {
        await this.walletDb.setAccount(newAccount, tx)
      }

      if (newAccount.createdAt !== null) {
        const previousBlock = await this.chainGetBlock({
          sequence: newAccount.createdAt.sequence - 1,
        })

        const head = previousBlock
          ? {
              hash: Buffer.from(previousBlock.block.hash, 'hex'),
              sequence: previousBlock.block.sequence,
            }
          : null

        await newAccount.updateHead(head, tx)
      } else {
        await newAccount.updateHead(null, tx)
      }

      if (account.id === this.defaultAccount) {
        await this.walletDb.setDefaultAccount(newAccount.id, tx)
        this.defaultAccount = newAccount.id
      }

      this.accountById.set(newAccount.id, newAccount)

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
    this.accountById.delete(account.id)

    await this.walletDb.db.withTransaction(tx, async (tx) => {
      if (account.id === this.defaultAccount) {
        await this.walletDb.setDefaultAccount(null, tx)
        this.defaultAccount = null
      }

      await this.walletDb.removeAccount(account, tx)
      await this.walletDb.removeHead(account, tx)
    })

    this.logger.debug(`Removed account name: ${account.name}, id: ${account.id}`)
    this.onAccountRemoved.emit(account)
  }

  async forceCleanupDeletedAccounts(): Promise<void> {
    await this.walletDb.forceCleanupDeletedAccounts(this.eventLoopAbortController.signal)
  }

  async cleanupDeletedAccounts(): Promise<void> {
    if (!this.isStarted) {
      return
    }

    if (this.scanner.running) {
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

  findAccount(predicate: (account: Account) => boolean): Account | null {
    for (const account of this.accountById.values()) {
      if (predicate(account)) {
        return account
      }
    }

    return null
  }

  getAccountByName(name: string): Account | null {
    return this.findAccount((account) => account.name === name)
  }

  getAccount(id: string): Account | null {
    const account = this.accountById.get(id)

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

  getEarliestHead(tx?: IDatabaseTransaction): Promise<HeadValue | null> {
    return this.walletDb.db.withTransaction(tx, async (tx) => {
      let earliestHead = null
      for (const account of this.accountById.values()) {
        if (!account.scanningEnabled) {
          continue
        }

        const head = await account.getHead(tx)

        if (!head) {
          return null
        }

        if (!earliestHead || earliestHead.sequence > head.sequence) {
          earliestHead = head
        }
      }

      return earliestHead
    })
  }

  getLatestHead(tx?: IDatabaseTransaction): Promise<HeadValue | null> {
    return this.walletDb.db.withTransaction(tx, async (tx) => {
      let latestHead = null

      for (const account of this.accountById.values()) {
        if (!account.scanningEnabled) {
          continue
        }

        const head = await account.getHead(tx)

        if (!head) {
          continue
        }

        if (!latestHead || latestHead.sequence < head.sequence) {
          latestHead = head
        }
      }

      return latestHead
    })
  }

  async isAccountUpToDate(account: Account, confirmations?: number): Promise<boolean> {
    const head = await account.getHead()

    if (head === null) {
      return false
    }

    confirmations = confirmations ?? this.config.get('confirmations')
    const chainHead = await this.getChainHead()
    return chainHead.sequence - head.sequence <= confirmations
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

  async getChainGenesis(): Promise<HeadValue> {
    try {
      Assert.isNotNull(this.nodeClient)
      const response = await this.nodeClient.chain.getChainInfo()
      return {
        hash: Buffer.from(response.content.genesisBlockIdentifier.hash, 'hex'),
        sequence: GENESIS_BLOCK_SEQUENCE,
      }
    } catch (error: unknown) {
      this.logger.error(ErrorUtils.renderError(error, true))
      throw error
    }
  }

  async getChainHead(): Promise<HeadValue> {
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

  async createMultisigSecret(name: string): Promise<Buffer> {
    return this.walletDb.db.transaction(async (tx) => {
      if (await this.walletDb.hasMultisigSecretName(name, tx)) {
        throw new DuplicateMultisigSecretNameError(name)
      }

      if (this.getAccountByName(name)) {
        throw new DuplicateAccountNameError(name)
      }

      const secret = multisig.ParticipantSecret.random()
      const identity = secret.toIdentity()

      await this.walletDb.putMultisigIdentity(
        identity.serialize(),
        {
          name,
          secret: secret.serialize(),
        },
        tx,
      )

      return identity.serialize()
    })
  }

  async accountsEncrypted(): Promise<boolean> {
    return this.walletDb.accountsEncrypted()
  }

  async encrypt(passphrase: string, tx?: IDatabaseTransaction): Promise<void> {
    const unlock = await this.createTransactionMutex.lock()

    try {
      Assert.isNull(this.masterKey)
      await this.walletDb.encryptAccounts(passphrase, tx)
      await this.load()
    } finally {
      unlock()
    }
  }

  async decrypt(passphrase: string, tx?: IDatabaseTransaction): Promise<void> {
    const unlock = await this.createTransactionMutex.lock()

    try {
      await this.walletDb.decryptAccounts(passphrase, tx)
      await this.load()
    } catch (e) {
      this.logger.error(ErrorUtils.renderError(e, true))
      throw e
    } finally {
      unlock()
    }
  }

  async lock(tx?: IDatabaseTransaction): Promise<void> {
    const unlock = await this.createTransactionMutex.lock()

    try {
      const encrypted = await this.walletDb.accountsEncrypted(tx)
      if (!encrypted) {
        return
      }

      this.stopUnlockTimeout()
      this.accountById.clear()
      this.locked = true

      if (this.masterKey) {
        await this.masterKey.lock()
      }

      this.logger.info(
        'Wallet locked. Unlock the wallet to view your accounts and create transactions',
      )
    } finally {
      unlock()
    }
  }

  async unlock(passphrase: string, timeout?: number, tx?: IDatabaseTransaction): Promise<void> {
    const unlock = await this.createTransactionMutex.lock()

    try {
      const encrypted = await this.walletDb.accountsEncrypted(tx)
      if (!encrypted) {
        return
      }

      Assert.isNotNull(this.masterKey)
      await this.masterKey.unlock(passphrase)

      for (const [id, account] of this.encryptedAccountById.entries()) {
        this.accountById.set(id, account.decrypt(this.masterKey))
      }

      this.startUnlockTimeout(timeout)
      this.locked = false
    } catch (e) {
      this.logger.debug('Wallet unlock failed')
      this.stopUnlockTimeout()
      this.accountById.clear()
      this.locked = true

      throw e
    } finally {
      unlock()
    }
  }

  private startUnlockTimeout(timeout?: number): void {
    if (!timeout) {
      timeout = DEFAULT_UNLOCK_TIMEOUT_MS
    }

    this.stopUnlockTimeout()

    // Keep the wallet unlocked indefinitely
    if (timeout === -1) {
      return
    }

    this.lockTimeout = setTimeout(() => void this.lock(), timeout)
  }

  private stopUnlockTimeout(): void {
    if (this.lockTimeout) {
      clearTimeout(this.lockTimeout)
      this.lockTimeout = null
    }
  }
}
