/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset, generateKey, Note as NativeNote } from '@ironfish/rust-nodejs'
import { BufferMap } from 'buffer-map'
import { v4 as uuid } from 'uuid'
import { Assert } from '../assert'
import { Blockchain } from '../blockchain'
import { ChainProcessor } from '../chainProcessor'
import { isExpiredSequence } from '../consensus'
import { Event } from '../event'
import { Config } from '../fileStores'
import { createRootLogger, Logger } from '../logger'
import { MemPool } from '../memPool'
import { getFee } from '../memPool/feeEstimator'
import { NoteHasher } from '../merkletree/hasher'
import { NoteWitness, Witness } from '../merkletree/witness'
import { Mutex } from '../mutex'
import { BlockHeader } from '../primitives/blockheader'
import { BurnDescription } from '../primitives/burnDescription'
import { Note } from '../primitives/note'
import { MintData, RawTransaction } from '../primitives/rawTransaction'
import { Transaction } from '../primitives/transaction'
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
import { Account, ACCOUNT_SCHEMA_VERSION } from './account'
import { AssetBalances } from './assetBalances'
import { NotEnoughFundsError } from './errors'
import { MintAssetOptions } from './interfaces/mintAssetOptions'
import { validateAccount } from './validator'
import { AccountValue } from './walletdb/accountValue'
import { AssetValue } from './walletdb/assetValue'
import { DecryptedNoteValue } from './walletdb/decryptedNoteValue'
import { TransactionValue } from './walletdb/transactionValue'
import { WalletDB } from './walletdb/walletdb'

const noteHasher = new NoteHasher()

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
  private readonly config: Config

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
  }: {
    chain: Blockchain
    config: Config
    database: WalletDB
    memPool: MemPool
    logger?: Logger
    rebroadcastAfter?: number
    workerPool: WorkerPool
  }) {
    this.chain = chain
    this.config = config
    this.logger = logger.withTag('accounts')
    this.memPool = memPool
    this.walletDb = database
    this.workerPool = workerPool
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

    this.chainProcessor.hash = await this.getLatestHeadHash()
  }

  private unload(): void {
    this.accounts.clear()

    this.defaultAccount = null
    this.chainProcessor.hash = null
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
    await this.expireTransactions()
    await this.rebroadcastTransactions()
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
      await this.resetAccount(account, tx)
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

  private async decryptNotesFromTransaction(
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
      const assetBalanceDeltas = new AssetBalances()

      await this.walletDb.db.transaction(async (tx) => {
        const transactions = await this.chain.getBlockTransactions(blockHeader)

        for (const { transaction, initialNoteIndex } of transactions) {
          if (scan && scan.isAborted) {
            scan.signalComplete()
            this.scan = null
            return
          }

          const decryptedNotesByAccountId = await this.decryptNotes(
            transaction,
            initialNoteIndex,
            false,
            [account],
          )

          const decryptedNotes = decryptedNotesByAccountId.get(account.id) ?? []

          if (decryptedNotes.length === 0 && !(await account.hasSpend(transaction))) {
            continue
          }

          const transactionDeltas = await account.connectTransaction(
            blockHeader,
            transaction,
            decryptedNotes,
            tx,
          )

          assetBalanceDeltas.update(transactionDeltas)

          await this.upsertAssetsFromDecryptedNotes(account, decryptedNotes, blockHeader, tx)
          scan?.signal(blockHeader.sequence)
        }

        await account.updateUnconfirmedBalances(
          assetBalanceDeltas,
          blockHeader.hash,
          blockHeader.sequence,
          tx,
        )

        await account.updateHead({ hash: blockHeader.hash, sequence: blockHeader.sequence }, tx)
      })
    }
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
          chainAsset.owner,
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

      if (decryptedNotes.length === 0 && !(await account.hasSpend(transaction))) {
        continue
      }

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
      `Scan starting from earliest found account head hash: ${beginHash.toString('hex')}`,
    )

    // Go through every transaction in the chain and add notes that we can decrypt
    for await (const blockHeader of this.chain.iterateBlockHeaders(
      beginHash,
      endHash,
      undefined,
      false,
    )) {
      await this.connectBlock(blockHeader, scan)
    }

    if (this.chainProcessor.hash === null) {
      const latestHeadHash = await this.getLatestHeadHash()
      Assert.isNotNull(latestHeadHash, `scanTransactions: No latest head hash found`)

      this.chainProcessor.hash = latestHeadHash
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
  ): AsyncGenerator<DecryptedNoteValue & { hash: Buffer }> {
    const confirmations = options?.confirmations ?? this.config.get('confirmations')

    for await (const decryptedNote of account.getUnspentNotes(assetId, {
      confirmations,
    })) {
      yield decryptedNote
    }
  }

  async send(
    account: Account,
    outputs: {
      publicAddress: string
      amount: bigint
      memo: string
      assetId: Buffer
    }[],
    fee: bigint,
    expirationDelta: number,
    expiration?: number | null,
    confirmations?: number | null,
  ): Promise<Transaction> {
    const raw = await this.createTransaction({
      account,
      outputs,
      fee,
      expirationDelta,
      expiration: expiration ?? undefined,
      confirmations: confirmations ?? undefined,
    })

    return this.post({
      transaction: raw,
      account,
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
        raw.fee = getFee(options.feeRate, raw.size())
      }

      await this.fund(raw, {
        fee: raw.fee,
        account: options.account,
        confirmations: confirmations,
      })

      if (options.feeRate) {
        raw.fee = getFee(options.feeRate, raw.size())
        raw.spends = []

        await this.fund(raw, {
          fee: raw.fee,
          account: options.account,
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
  }): Promise<Transaction> {
    const spendingKey = options.account?.spendingKey ?? options.spendingKey
    Assert.isTruthy(spendingKey, `Spending key is required to post transaction`)

    const transaction = await this.postTransaction(options.transaction, spendingKey)

    const verify = this.chain.verifier.verifyCreatedTransaction(transaction)
    if (!verify.valid) {
      throw new Error(`Invalid transaction, reason: ${String(verify.reason)}`)
    }

    await this.addPendingTransaction(transaction)
    this.memPool.acceptTransaction(transaction)
    this.broadcastTransaction(transaction)
    this.onTransactionCreated.emit(transaction)

    return transaction
  }

  async postTransaction(raw: RawTransaction, spendingKey: string): Promise<Transaction> {
    return await this.workerPool.postTransaction(raw, spendingKey)
  }

  async fund(
    raw: RawTransaction,
    options: {
      fee: bigint
      account: Account
      confirmations: number
    },
  ): Promise<void> {
    const needed = this.buildAmountsNeeded(raw, {
      fee: options.fee,
    })

    const spends = await this.createSpends(options.account, needed, options.confirmations)

    for (const spend of spends) {
      const witness = new Witness(
        spend.witness.treeSize(),
        spend.witness.rootHash,
        spend.witness.authenticationPath,
        noteHasher,
      )

      raw.spends.push({
        note: spend.note,
        witness: witness,
      })
    }
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
      const currentAmount = amountsNeeded.get(output.note.assetId()) ?? BigInt(0)
      amountsNeeded.set(output.note.assetId(), currentAmount + output.note.value())
    }

    for (const burn of raw.burns) {
      const currentAmount = amountsNeeded.get(burn.assetId) ?? BigInt(0)
      amountsNeeded.set(burn.assetId, currentAmount + burn.value)
    }

    return amountsNeeded
  }

  private async createSpends(
    sender: Account,
    amountsNeeded: BufferMap<bigint>,
    confirmations: number,
  ): Promise<Array<{ note: Note; witness: NoteWitness }>> {
    const notesToSpend: Array<{ note: Note; witness: NoteWitness }> = []

    for (const [assetId, amountNeeded] of amountsNeeded.entries()) {
      const { amount, notes } = await this.createSpendsForAsset(
        sender,
        assetId,
        amountNeeded,
        confirmations,
      )

      if (amount < amountNeeded) {
        throw new NotEnoughFundsError(assetId, amount, amountNeeded)
      }

      notesToSpend.push(...notes)
    }

    return notesToSpend
  }

  async createSpendsForAsset(
    sender: Account,
    assetId: Buffer,
    amountNeeded: bigint,
    confirmations: number,
  ): Promise<{ amount: bigint; notes: Array<{ note: Note; witness: NoteWitness }> }> {
    let amount = BigInt(0)
    const notes: Array<{ note: Note; witness: NoteWitness }> = []

    const head = await sender.getHead()
    if (!head) {
      return { amount, notes }
    }

    for await (const unspentNote of this.getUnspentNotes(sender, assetId)) {
      if (unspentNote.note.value() <= BigInt(0)) {
        continue
      }

      Assert.isNotNull(unspentNote.index)
      Assert.isNotNull(unspentNote.nullifier)
      Assert.isNotNull(unspentNote.sequence)

      const isConfirmed = head.sequence - unspentNote.sequence >= confirmations
      if (!isConfirmed) {
        continue
      }

      if (await this.checkNoteOnChainAndRepair(sender, unspentNote)) {
        continue
      }

      // Try creating a witness from the note
      const witness = await this.chain.notes.witness(unspentNote.index)

      if (witness === null) {
        this.logger.debug(`Could not create a witness for note with index ${unspentNote.index}`)
        continue
      }

      this.logger.debug(
        `Accounts: spending note ${unspentNote.index} ${unspentNote.hash.toString(
          'hex',
        )} ${unspentNote.note.value()}`,
      )

      // Otherwise, push the note into the list of notes to spend
      notes.push({ note: unspentNote.note, witness })
      amount += unspentNote.note.value()

      if (amount >= amountNeeded) {
        break
      }
    }

    return { amount, notes }
  }

  /**
   * Checks if a note is already on the chain when trying to spend it
   *
   * This function should be deleted once the wallet is detached from the chain,
   * either way. It shouldn't be necessary. It's just a hold over function to
   * sanity check from wallet 1.0.
   *
   * @returns true if the note is on the chain already
   */
  private async checkNoteOnChainAndRepair(
    sender: Account,
    unspentNote: DecryptedNoteValue & { hash: Buffer },
  ): Promise<boolean> {
    if (!unspentNote.nullifier) {
      return false
    }

    const spent = await this.chain.nullifiers.contains(unspentNote.nullifier)

    if (!spent) {
      return false
    }

    this.logger.debug(
      `Note was marked unspent, but nullifier found in tree: ${unspentNote.nullifier.toString(
        'hex',
      )}`,
    )

    // Update our map so this doesn't happen again
    const noteMapValue = await sender.getDecryptedNote(unspentNote.hash)

    if (noteMapValue) {
      this.logger.debug(`Unspent note has index ${String(noteMapValue.index)}`)
      await this.walletDb.saveDecryptedNote(sender, unspentNote.hash, {
        ...noteMapValue,
        spent: true,
      })
    }

    return true
  }

  broadcastTransaction(transaction: Transaction): void {
    this.onBroadcastTransaction.emit(transaction)
  }

  async rebroadcastTransactions(): Promise<void> {
    if (!this.isStarted) {
      return
    }

    if (!this.chain.synced) {
      return
    }

    if (this.chainProcessor.hash === null) {
      return
    }

    const head = await this.chain.getHeader(this.chainProcessor.hash)

    if (head === null) {
      return
    }

    for (const account of this.accounts.values()) {
      if (this.eventLoopAbortController.signal.aborted) {
        return
      }

      for await (const transactionInfo of account.getPendingTransactions(head.sequence)) {
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
        if (head.sequence - submittedSequence < this.rebroadcastAfter) {
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
              submittedSequence: head.sequence,
            },
            tx,
          )

          if (!verify.valid) {
            isValid = false
            this.logger.debug(
              `Ignoring invalid transaction during rebroadcast ${transactionHash.toString(
                'hex',
              )}, reason ${String(verify.reason)} seq: ${head.sequence}`,
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

  async expireTransactions(): Promise<void> {
    if (!this.isStarted) {
      return
    }

    if (!this.chain.synced) {
      return
    }

    if (this.chainProcessor.hash === null) {
      return
    }

    const head = await this.chain.getHeader(this.chainProcessor.hash)

    if (head === null) {
      return
    }

    for (const account of this.accounts.values()) {
      if (this.eventLoopAbortController.signal.aborted) {
        return
      }

      for await (const { transaction } of account.getExpiredTransactions(head.sequence)) {
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
      const isConfirmed = headSequence - transaction.sequence >= confirmations

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

    let send = false

    for (const spend of transaction.transaction.spends) {
      if ((await account.getNoteHash(spend.nullifier, tx)) !== null) {
        send = true
        break
      }
    }

    return send ? TransactionType.SEND : TransactionType.RECEIVE
  }

  async createAccount(name: string, setDefault = false): Promise<Account> {
    if (this.getAccountByName(name)) {
      throw new Error(`Account already exists with the name ${name}`)
    }

    const key = generateKey()

    const account = new Account({
      version: ACCOUNT_SCHEMA_VERSION,
      id: uuid(),
      name,
      incomingViewKey: key.incomingViewKey,
      outgoingViewKey: key.outgoingViewKey,
      publicAddress: key.publicAddress,
      spendingKey: key.spendingKey,
      viewKey: key.viewKey,
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
    if (accounts.find((a) => accountValue.spendingKey === a.spendingKey)) {
      throw new Error(`Account already exists with provided spending key`)
    }
    if (accounts.find((a) => accountValue.viewKey === a.viewKey)) {
      throw new Error(`Account already exists with provided view key`)
    }

    validateAccount(accountValue)

    const account = new Account({
      ...accountValue,
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

  async resetAccount(account: Account, tx?: IDatabaseTransaction): Promise<void> {
    const newAccount = new Account({
      ...account,
      id: uuid(),
      walletDb: this.walletDb,
    })

    await this.walletDb.db.withTransaction(tx, async (tx) => {
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

  async cleanupDeletedAccounts(): Promise<void> {
    if (!this.isStarted) {
      return
    }

    if (this.scan || this.updateHeadState) {
      return
    }

    await this.walletDb.cleanupDeletedAccounts(this.eventLoopAbortController.signal)
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

  async getLatestHeadHash(): Promise<Buffer | null> {
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
