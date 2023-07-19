/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset, generateKey, Note as NativeNote } from '@ironfish/rust-nodejs'
import { BufferMap, BufferSet } from 'buffer-map'
import { v4 as uuid } from 'uuid'
import { Assert } from '../assert'
import { Blockchain } from '../blockchain'
import { ChainProcessor } from '../chainProcessor'
import { Consensus, isExpiredSequence, Verifier } from '../consensus'
import { Event } from '../event'
import { Config } from '../fileStores'
import { createRootLogger, Logger } from '../logger'
import { MemPool } from '../memPool'
import { getFee } from '../memPool/feeEstimator'
import { NoteHasher } from '../merkletree'
import { Side } from '../merkletree/merkletree'
import { Witness } from '../merkletree/witness'
import { Mutex } from '../mutex'
import { GENESIS_BLOCK_SEQUENCE } from '../primitives'
import { BlockHeader } from '../primitives/blockheader'
import { BurnDescription } from '../primitives/burnDescription'
import { Note } from '../primitives/note'
import { NoteEncrypted } from '../primitives/noteEncrypted'
import { MintData, RawTransaction } from '../primitives/rawTransaction'
import { Transaction } from '../primitives/transaction'
import { RpcClient } from '../rpc'
import { IDatabaseTransaction } from '../storage/database/transaction'
import {
  AsyncUtils,
  BufferUtils,
  PromiseResolve,
  PromiseUtils,
  SetTimeoutToken,
} from '../utils'
import { WorkerPool } from '../workerPool'
import { DecryptedNote, DecryptNoteOptions } from '../workerPool/tasks/decryptNotes'
import { Account, ACCOUNT_SCHEMA_VERSION } from './account/account'
import { AssetBalances } from './assetBalances'
import { NotEnoughFundsError } from './errors'
import { MintAssetOptions } from './interfaces/mintAssetOptions'
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

export class Wallet {
  readonly onAccountImported = new Event<[account: Account]>()
  readonly onAccountRemoved = new Event<[account: Account]>()
  readonly onBroadcastTransaction = new Event<[transaction: Transaction]>()
  readonly onTransactionCreated = new Event<[transaction: Transaction]>()

  scan: ScanState | null = null
  updateHeadState: ScanState | null = null

  protected readonly accounts = new Map<string, Account>()
  readonly walletDb: WalletDB
  readonly logger: Logger
  readonly workerPool: WorkerPool
  readonly chain: Blockchain
  readonly chainProcessor: ChainProcessor
  readonly memPool: MemPool
  readonly nodeClient: RpcClient
  private readonly config: Config
  readonly consensus: Consensus

  protected rebroadcastAfter: number
  protected defaultAccount: string | null = null
  protected isStarted = false
  protected isOpen = false
  protected eventLoopTimeout: SetTimeoutToken | null = null
  private readonly createTransactionMutex: Mutex
  private readonly eventLoopAbortController: AbortController
  private eventLoopPromise: Promise<void> | null = null
  private eventLoopResolve: PromiseResolve<void> | null = null

  constructor({
    chain,
    config,
    memPool,
    database,
    logger = createRootLogger(),
    rebroadcastAfter,
    workerPool,
    consensus,
    nodeClient,
  }: {
    chain: Blockchain
    config: Config
    database: WalletDB
    memPool: MemPool
    logger?: Logger
    rebroadcastAfter?: number
    workerPool: WorkerPool
    consensus: Consensus
    nodeClient: RpcClient
  }) {
    this.chain = chain
    this.config = config
    this.logger = logger.withTag('accounts')
    this.memPool = memPool
    this.walletDb = database
    this.workerPool = workerPool
    this.consensus = consensus
    this.nodeClient = nodeClient
    this.rebroadcastAfter = rebroadcastAfter ?? 10
    this.createTransactionMutex = new Mutex()
    this.eventLoopAbortController = new AbortController()

    this.chainProcessor = new ChainProcessor({
      logger: this.logger,
      chain: chain,
      head: null,
    })

    this.chainProcessor.onAdd.on(async (header) => {
      this.logger.debug(`AccountHead ADD: ${Number(header.sequence) - 1} => ${header.sequence}`)

      await this.connectBlock(header)
      await this.expireTransactions(header.sequence)
      await this.rebroadcastTransactions(header.sequence)
    })

    this.chainProcessor.onRemove.on(async (header) => {
      this.logger.debug(`AccountHead DEL: ${header.sequence} => ${Number(header.sequence) - 1}`)

      await this.disconnectBlock(header)
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
      const { hashChanged } = await this.chainProcessor.update({
        signal: scan.abortController.signal,
      })

      if (hashChanged) {
        this.logger.debug(
          `Updated Accounts Head: ${String(this.chainProcessor.hash?.toString('hex'))}`,
        )
      }
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

    const meta = await this.walletDb.loadAccountsMeta()
    this.defaultAccount = meta.defaultAccountId

    const latestHead = await this.getLatestHead()
    if (latestHead) {
      this.chainProcessor.hash = latestHead.hash
      this.chainProcessor.sequence = latestHead.sequence
    }
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

    for (const account of this.listAccounts()) {
      if (account.createdAt === null || this.chainProcessor.sequence === null) {
        continue
      }

      if (account.createdAt.sequence > this.chainProcessor.sequence) {
        continue
      }

      if (!(await this.chain.hasBlock(account.createdAt.hash))) {
        await this.resetAccount(account, { resetCreatedAt: true })
      }
    }

    if (this.chainProcessor.hash) {
      const hasHeadBlock = await this.chain.hasBlock(this.chainProcessor.hash)

      if (!hasHeadBlock) {
        this.logger.error(
          `Resetting accounts database because accounts head was not found in chain: ${this.chainProcessor.hash.toString(
            'hex',
          )}`,
        )
        await this.reset()
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
    await this.cleanupDeletedAccounts()

    if (this.isStarted) {
      this.eventLoopTimeout = setTimeout(() => void this.eventLoop(), 1000)
    }

    resolve()
    this.eventLoopPromise = null
    this.eventLoopResolve = null
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

  async connectBlock(blockHeader: BlockHeader, scan?: ScanState): Promise<void> {
    const accounts = await AsyncUtils.filter(this.listAccounts(), async (account) => {
      const accountHead = await account.getHead()

      if (!accountHead) {
        return blockHeader.sequence === 1
      } else {
        return BufferUtils.equalsNullable(accountHead.hash, blockHeader.previousBlockHash)
      }
    })

    for (const account of accounts) {
      const shouldDecrypt = await this.shouldDecryptForAccount(blockHeader, account, scan)

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
    blockHeader: BlockHeader,
    account: Account,
    scan?: ScanState,
  ): Promise<boolean> {
    if (account.createdAt === null) {
      return true
    }

    if (account.createdAt.sequence < blockHeader.sequence) {
      return true
    }

    if (account.createdAt.sequence === blockHeader.sequence) {
      if (!account.createdAt.hash.equals(blockHeader.hash)) {
        // account.createdAt is refers to a block that is not on the main chain
        await this.resetAccount(account, { resetCreatedAt: true })
        await scan?.abort()
        void this.scanTransactions()

        return false
      }

      return true
    }

    return false
  }

  private async connectBlockTransactions(
    blockHeader: BlockHeader,
    account: Account,
    scan?: ScanState,
    tx?: IDatabaseTransaction,
  ): Promise<AssetBalances> {
    const assetBalanceDeltas = new AssetBalances()
    const transactions = await this.chain.getBlockTransactions(blockHeader)

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
    blockHeader?: BlockHeader,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    for (const { serializedNote } of decryptedNotes) {
      const note = new Note(serializedNote)
      const asset = await this.walletDb.getAsset(account, note.assetId(), tx)

      if (!asset) {
        const chainAsset = await this.chain.getAssetById(note.assetId())
        Assert.isNotNull(chainAsset, 'Asset must be non-null in the chain')
        await account.saveAssetFromChain(
          chainAsset.createdTransactionHash,
          chainAsset.id,
          chainAsset.metadata,
          chainAsset.name,
          chainAsset.nonce,
          chainAsset.creator,
          blockHeader,
          tx,
        )
      } else if (blockHeader) {
        await account.updateAssetWithBlockHeader(
          asset,
          { hash: blockHeader.hash, sequence: blockHeader.sequence },
          tx,
        )
      }
    }
  }

  async disconnectBlock(header: BlockHeader): Promise<void> {
    const accounts = await AsyncUtils.filter(this.listAccounts(), async (account) => {
      const accountHead = await account.getHead()

      return BufferUtils.equalsNullable(accountHead?.hash ?? null, header.hash)
    })

    for (const account of accounts) {
      const assetBalanceDeltas = new AssetBalances()

      await this.walletDb.db.transaction(async (tx) => {
        const transactions = await this.chain.getBlockTransactions(header)

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

    for (const account of accounts) {
      const decryptedNotes = decryptedNotesByAccountId.get(account.id) ?? []

      await account.addPendingTransaction(transaction, decryptedNotes, this.chain.head.sequence)
      await this.upsertAssetsFromDecryptedNotes(account, decryptedNotes)
    }
  }

  async scanTransactions(fromHash?: Buffer): Promise<void> {
    if (!this.isOpen) {
      throw new Error('Cannot start a scan if accounts are not loaded')
    }

    if (this.scan) {
      this.logger.info('Skipping Scan, already scanning.')
      return
    }

    const scan = new ScanState()
    this.scan = scan

    // If we are updating the account head, we need to wait until its finished
    // but setting this.scan is our lock so updating the head doesn't run again
    await this.updateHeadState?.wait()

    const startHash = await this.getEarliestHeadHash()

    // Priority: fromHeader > startHeader > genesisBlock
    const beginHash = fromHash ? fromHash : startHash ? startHash : this.chain.genesis.hash
    const beginHeader = await this.chain.getHeader(beginHash)

    Assert.isNotNull(
      beginHeader,
      `scanTransactions: No header found for start hash ${beginHash.toString('hex')}`,
    )

    const endHash = this.chainProcessor.hash || this.chain.head.hash
    const endHeader = await this.chain.getHeader(endHash)

    Assert.isNotNull(
      endHeader,
      `scanTransactions: No header found for end hash ${endHash.toString('hex')}`,
    )

    scan.sequence = beginHeader.sequence
    scan.endSequence = endHeader.sequence

    if (scan.isAborted || beginHash.equals(endHash)) {
      scan.signalComplete()
      this.scan = null
      return
    }

    this.logger.info(
      `Scan starting from block ${beginHash.toString('hex')} (${beginHeader.sequence})`,
    )

    // Go through every transaction in the chain and add notes that we can decrypt
    for await (const blockHeader of this.chain.iterateBlockHeaders(
      beginHash,
      endHash,
      undefined,
      false,
    )) {
      await this.connectBlock(blockHeader, scan)
      scan.signal(blockHeader.sequence)
    }

    if (this.chainProcessor.hash === null) {
      const latestHead = await this.getLatestHead()
      Assert.isNotNull(latestHead, `scanTransactions: No latest head found`)

      this.chainProcessor.hash = latestHead.hash
      this.chainProcessor.sequence = latestHead.sequence
    }

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
    outputs: {
      publicAddress: string
      amount: bigint
      memo: string
      assetId: Buffer
    }[]
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

    return this.post({
      transaction: raw,
      account: options.account,
    })
  }

  async mint(account: Account, options: MintAssetOptions): Promise<Transaction> {
    let mintData: MintData

    if ('assetId' in options) {
      const asset = await this.chain.getAssetById(options.assetId)
      if (!asset) {
        throw new Error(
          `Asset not found. Cannot mint for identifier '${options.assetId.toString('hex')}'`,
        )
      }

      mintData = {
        name: asset.name.toString('utf8'),
        metadata: asset.metadata.toString('utf8'),
        value: options.value,
      }
    } else {
      mintData = {
        name: options.name,
        metadata: options.metadata,
        value: options.value,
      }
    }

    const raw = await this.createTransaction({
      account,
      mints: [mintData],
      fee: options.fee,
      expirationDelta: options.expirationDelta,
      expiration: options.expiration,
      confirmations: options.confirmations,
    })

    return this.post({
      transaction: raw,
      account,
    })
  }

  async burn(
    account: Account,
    assetId: Buffer,
    value: bigint,
    fee: bigint,
    expirationDelta: number,
    expiration?: number,
    confirmations?: number,
  ): Promise<Transaction> {
    const raw = await this.createTransaction({
      account,
      burns: [{ assetId, value }],
      fee,
      expirationDelta,
      expiration,
      confirmations,
    })

    return this.post({
      transaction: raw,
      account,
    })
  }

  async createTransaction(options: {
    account: Account
    notes?: Buffer[]
    outputs?: {
      publicAddress: string
      amount: bigint
      memo: string
      assetId: Buffer
    }[]
    mints?: MintData[]
    burns?: BurnDescription[]
    fee?: bigint
    feeRate?: bigint
    expiration?: number
    expirationDelta?: number
    confirmations?: number
  }): Promise<RawTransaction> {
    const heaviestHead = this.chain.head
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

    if (isExpiredSequence(expiration, this.chain.head.sequence)) {
      throw new Error(
        `Invalid expiration sequence for transaction ${expiration} vs ${this.chain.head.sequence}`,
      )
    }

    const unlock = await this.createTransactionMutex.lock()

    try {
      this.assertHasAccount(options.account)

      if (!(await this.isAccountUpToDate(options.account))) {
        throw new Error('Your account must finish scanning before sending a transaction.')
      }

      const raw = new RawTransaction()
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
  }): Promise<Transaction> {
    const broadcast = options.broadcast ?? true

    const spendingKey = options.account?.spendingKey ?? options.spendingKey
    Assert.isTruthy(spendingKey, `Spending key is required to post transaction`)

    const transaction = await this.workerPool.postTransaction(options.transaction, spendingKey)

    const verify = Verifier.verifyCreatedTransaction(transaction, this.consensus)

    if (!verify.valid) {
      throw new Error(`Invalid transaction, reason: ${String(verify.reason)}`)
    }

    if (broadcast) {
      await this.addPendingTransaction(transaction)
      this.memPool.acceptTransaction(transaction)
      this.broadcastTransaction(transaction)
      this.onTransactionCreated.emit(transaction)
    }

    return transaction
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

  broadcastTransaction(transaction: Transaction): void {
    this.onBroadcastTransaction.emit(transaction)
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

        let isValid = true
        await this.walletDb.db.transaction(async (tx) => {
          const verify = await this.chain.verifier.verifyTransactionAdd(transaction)

          // We still update this even if it's not valid to prevent constantly
          // reprocessing valid transaction every block. Give them a few blocks to
          // try to become valid.
          await this.walletDb.saveTransaction(
            account,
            transactionHash,
            {
              ...transactionInfo,
              submittedSequence: sequence,
            },
            tx,
          )

          if (!verify.valid) {
            isValid = false
            this.logger.debug(
              `Ignoring invalid transaction during rebroadcast ${transactionHash.toString(
                'hex',
              )}, reason ${String(verify.reason)} seq: ${sequence}`,
            )
          }
        })

        if (!isValid) {
          continue
        }
        this.broadcastTransaction(transaction)
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

  async createAccount(name: string, setDefault = false): Promise<Account> {
    if (this.getAccountByName(name)) {
      throw new Error(`Account already exists with the name ${name}`)
    }

    const key = generateKey()

    let createdAt = null
    if (this.chainProcessor.hash && this.chainProcessor.sequence) {
      createdAt = {
        hash: this.chainProcessor.hash,
        sequence: this.chainProcessor.sequence,
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
      await this.skipRescan(account, tx)
    })

    this.accounts.set(account.id, account)

    if (setDefault) {
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
    if (createdAt !== null && !(await this.chain.hasBlock(createdAt.hash))) {
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
