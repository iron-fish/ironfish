/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { generateKey, generateNewPublicAddress } from '@ironfish/rust-nodejs'
import { v4 as uuid } from 'uuid'
import { Assert } from '../assert'
import { Blockchain } from '../blockchain'
import { ChainProcessor } from '../chainProcessor'
import { Event } from '../event'
import { Config } from '../fileStores'
import { createRootLogger, Logger } from '../logger'
import { MemPool } from '../memPool'
import { NoteWitness } from '../merkletree/witness'
import { Mutex } from '../mutex'
import { Note } from '../primitives/note'
import { Transaction } from '../primitives/transaction'
import { IDatabaseTransaction } from '../storage/database/transaction'
import { BufferUtils, PromiseResolve, PromiseUtils, SetTimeoutToken } from '../utils'
import { WorkerPool } from '../workerPool'
import { DecryptedNote, DecryptNoteOptions } from '../workerPool/tasks/decryptNotes'
import { Account } from './account'
import { NotEnoughFundsError } from './errors'
import { validateAccount } from './validator'
import { AccountValue } from './walletdb/accountValue'
import { DecryptedNoteValue } from './walletdb/decryptedNoteValue'
import { TransactionValue } from './walletdb/transactionValue'
import { WalletDB } from './walletdb/walletdb'

export enum TransactionStatus {
  CONFIRMED = 'confirmed',
  EXPIRED = 'expired',
  PENDING = 'pending',
  UNCONFIRMED = 'unconfirmed',
  UNKNOWN = 'unknown',
}

export type SyncTransactionParams =
  // Used when receiving a transaction from a block with notes
  // that have been added to the trees
  | { blockHash: Buffer; initialNoteIndex: number; sequence: number }
  // Used if the transaction is not yet part of the chain
  | { submittedSequence: number }
  | Record<string, never>

export class Wallet {
  readonly onAccountImported = new Event<[account: Account]>()
  readonly onAccountRemoved = new Event<[account: Account]>()
  readonly onBroadcastTransaction = new Event<[transaction: Transaction]>()
  readonly onTransactionCreated = new Event<[transaction: Transaction]>()

  scan: ScanState | null = null
  updateHeadState: ScanState | null = null

  protected readonly headHashes = new Map<string, Buffer | null>()

  protected readonly accounts = new Map<string, Account>()
  readonly walletDb: WalletDB
  readonly logger: Logger
  readonly workerPool: WorkerPool
  readonly chain: Blockchain
  readonly chainProcessor: ChainProcessor
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
    database,
    logger = createRootLogger(),
    rebroadcastAfter,
    workerPool,
  }: {
    chain: Blockchain
    config: Config
    database: WalletDB
    logger?: Logger
    rebroadcastAfter?: number
    workerPool: WorkerPool
  }) {
    this.chain = chain
    this.config = config
    this.logger = logger.withTag('accounts')
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

      for await (const {
        transaction,
        blockHash,
        sequence,
        initialNoteIndex,
      } of this.chain.iterateBlockTransactions(header)) {
        await this.syncTransaction(transaction, {
          blockHash,
          initialNoteIndex,
          sequence,
        })
      }

      await this.updateHeadHashes(header.hash)
    })

    this.chainProcessor.onRemove.on(async (header) => {
      this.logger.debug(`AccountHead DEL: ${header.sequence} => ${Number(header.sequence) - 1}`)

      for await (const { transaction } of this.chain.iterateBlockTransactions(header)) {
        await this.syncTransaction(transaction, {})
      }

      await this.updateHeadHashes(header.previousBlockHash)
    })
  }

  async updateHead(): Promise<void> {
    if (this.scan || this.updateHeadState) {
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

  get shouldRescan(): boolean {
    if (this.scan) {
      return false
    }

    for (const account of this.accounts.values()) {
      if (!this.isAccountUpToDate(account)) {
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

    for await (const { accountId, headHash } of this.walletDb.loadHeadHashes()) {
      this.headHashes.set(accountId, headHash)
    }

    this.chainProcessor.hash = await this.getLatestHeadHash()
  }

  private unload(): void {
    this.accounts.clear()
    this.headHashes.clear()

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

    if (this.shouldRescan && !this.scan) {
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

    if (this.walletDb.db.isOpen) {
      await this.updateHeadHashes(this.chainProcessor.hash)
    }
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

  async updateHeadHashes(headHash: Buffer | null, tx?: IDatabaseTransaction): Promise<void> {
    let accounts = this.listAccounts()

    if (headHash) {
      accounts = accounts.filter((a) => this.isAccountUpToDate(a))
    }

    await this.walletDb.db.withTransaction(tx, async (tx) => {
      for (const account of accounts) {
        await this.updateHeadHash(account, headHash, tx)
      }
    })
  }

  async updateHeadHash(
    account: Account,
    headHash: Buffer | null,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    this.headHashes.set(account.id, headHash)

    await this.walletDb.saveHeadHash(account, headHash, tx)
  }

  async reset(): Promise<void> {
    await this.walletDb.db.transaction(async (tx) => {
      await this.resetAccounts(tx)
      await this.updateHeadHashes(null, tx)
    })

    this.chainProcessor.hash = null
  }

  private async resetAccounts(tx?: IDatabaseTransaction): Promise<void> {
    for (const account of this.accounts.values()) {
      await account.reset(tx)
    }
  }

  private async decryptNotes(
    transaction: Transaction,
    initialNoteIndex: number | null,
    accounts?: Array<Account>,
  ): Promise<Map<string, Array<DecryptedNote>>> {
    const accountsToCheck =
      accounts || this.listAccounts().filter((a) => this.isAccountUpToDate(a))

    const decryptedNotesByAccountId = new Map<string, Array<DecryptedNote>>()

    const batchSize = 20
    for (const account of accountsToCheck) {
      const decryptedNotes = []
      let decryptNotesPayloads = []
      let currentNoteIndex = initialNoteIndex

      for (const note of transaction.notes()) {
        decryptNotesPayloads.push({
          serializedNote: note.serialize(),
          incomingViewKey: account.incomingViewKey,
          outgoingViewKey: account.outgoingViewKey,
          spendingKey: account.spendingKey,
          currentNoteIndex,
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

  /**
   * Called:
   *  - Called when transactions are added to the mem pool
   *  - Called for transactions on disconnected blocks
   *  - Called when transactions are added to a block on the genesis chain
   */
  async syncTransaction(
    transaction: Transaction,
    params: SyncTransactionParams,
    accounts?: Array<Account>,
  ): Promise<void> {
    const initialNoteIndex = 'initialNoteIndex' in params ? params.initialNoteIndex : null

    const decryptedNotesByAccountId = await this.decryptNotes(
      transaction,
      initialNoteIndex,
      accounts,
    )

    for (const [accountId, decryptedNotes] of decryptedNotesByAccountId) {
      const account = this.accounts.get(accountId)
      Assert.isNotUndefined(account, `syncTransaction: No account found for ${accountId}`)
      await account.syncTransaction(transaction, decryptedNotes, params)
    }
  }

  async scanTransactions(): Promise<void> {
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

    let startHash = await this.getEarliestHeadHash()
    let startHeader = startHash ? await this.chain.getHeader(startHash) : null

    const endHash = this.chainProcessor.hash || this.chain.head.hash
    const endHeader = await this.chain.getHeader(endHash)

    // Accounts that need to be updated at the current scan sequence
    const accounts: Array<Account> = []
    // Accounts that need to be updated at future scan sequences
    let remainingAccounts: Array<Account> = []

    for (const account of this.accounts.values()) {
      const headHash = this.headHashes.get(account.id)
      Assert.isNotUndefined(
        headHash,
        `scanTransactions: No head hash found for ${account.displayName}`,
      )

      if (BufferUtils.equalsNullable(startHash, headHash)) {
        accounts.push(account)
      } else if (!this.isAccountUpToDate(account)) {
        remainingAccounts.push(account)
      }
    }

    if (!startHash) {
      startHash = this.chain.genesis.hash
      startHeader = await this.chain.getHeader(startHash)
    }

    Assert.isNotNull(
      startHeader,
      `scanTransactions: No header found for start hash ${startHash.toString('hex')}`,
    )

    Assert.isNotNull(
      endHeader,
      `scanTransactions: No header found for end hash ${endHash.toString('hex')}`,
    )

    scan.sequence = startHeader.sequence
    scan.endSequence = endHeader.sequence

    if (scan.isAborted) {
      scan.signalComplete()
      this.scan = null
      return
    }

    this.logger.info(
      `Scan starting from earliest found account head hash: ${startHash.toString('hex')}`,
    )
    this.logger.info(`Accounts to scan for: ${accounts.map((a) => a.displayName).join(', ')}`)

    // Go through every transaction in the chain and add notes that we can decrypt
    for await (const blockHeader of this.chain.iterateBlockHeaders(
      startHash,
      endHash,
      undefined,
      false,
    )) {
      for await (const {
        blockHash,
        transaction,
        initialNoteIndex,
        sequence,
      } of this.chain.iterateBlockTransactions(blockHeader)) {
        if (scan.isAborted) {
          scan.signalComplete()
          this.scan = null
          return
        }

        await this.syncTransaction(
          transaction,
          {
            blockHash,
            initialNoteIndex,
            sequence,
          },
          accounts,
        )

        scan.signal(sequence)
      }

      for (const account of accounts) {
        await this.updateHeadHash(account, blockHeader.hash)
      }

      const newRemainingAccounts = []

      for (const remainingAccount of remainingAccounts) {
        const headHash = this.headHashes.get(remainingAccount.id)
        Assert.isNotUndefined(
          headHash,
          `scanTransactions: No head hash found for remaining account ${remainingAccount.displayName}`,
        )

        if (BufferUtils.equalsNullable(headHash, blockHeader.hash)) {
          accounts.push(remainingAccount)
          this.logger.debug(`Adding ${remainingAccount.displayName} to scan`)
        } else {
          newRemainingAccounts.push(remainingAccount)
        }
      }

      remainingAccounts = newRemainingAccounts
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

  async getBalance(
    account: Account,
    options?: { minimumBlockConfirmations?: number },
  ): Promise<{
    unconfirmedCount: number
    pendingCount: number
    pending: bigint
    unconfirmed: bigint
    confirmed: bigint
  }> {
    const minimumBlockConfirmations = Math.max(
      options?.minimumBlockConfirmations ?? this.config.get('minimumBlockConfirmations'),
      0,
    )

    return await this.walletDb.db.transaction(async (tx) => {
      this.assertHasAccount(account)

      const headSequence = await this.getAccountHeadSequence(account, tx)

      if (!headSequence) {
        return {
          unconfirmed: BigInt(0),
          confirmed: BigInt(0),
          pending: BigInt(0),
          unconfirmedCount: 0,
          pendingCount: 0,
        }
      }

      return account.getBalance(headSequence, minimumBlockConfirmations, tx)
    })
  }

  private async *getUnspentNotes(
    account: Account,
    options?: {
      minimumBlockConfirmations?: number
    },
  ): AsyncGenerator<DecryptedNoteValue & { hash: Buffer }> {
    const minimumBlockConfirmations =
      options?.minimumBlockConfirmations ?? this.config.get('minimumBlockConfirmations')

    const headSequence = await this.getAccountHeadSequence(account)
    if (!headSequence) {
      return
    }

    for await (const decryptedNote of account.getUnspentNotes()) {
      if (minimumBlockConfirmations > 0) {
        const transaction = await account.getTransaction(decryptedNote.transactionHash)

        Assert.isNotUndefined(
          transaction,
          `Transaction '${decryptedNote.transactionHash.toString(
            'hex',
          )}' missing for account '${account.id}'`,
        )

        if (!transaction.sequence) {
          continue
        }

        const confirmations = headSequence - transaction.sequence

        if (confirmations < minimumBlockConfirmations) {
          continue
        }
      }

      yield decryptedNote
    }
  }

  async pay(
    memPool: MemPool,
    sender: Account,
    receives: { publicAddress: string; amount: bigint; memo: string }[],
    transactionFee: bigint,
    defaultTransactionExpirationSequenceDelta: number,
    expirationSequence?: number | null,
  ): Promise<Transaction> {
    const heaviestHead = this.chain.head
    if (heaviestHead === null) {
      throw new Error('You must have a genesis block to create a transaction')
    }

    expirationSequence =
      expirationSequence ?? heaviestHead.sequence + defaultTransactionExpirationSequenceDelta

    if (this.chain.verifier.isExpiredSequence(expirationSequence, this.chain.head.sequence)) {
      throw new Error('Invalid expiration sequence for transaction')
    }

    const transaction = await this.createTransaction(
      sender,
      receives,
      transactionFee,
      expirationSequence,
    )

    const verify = this.chain.verifier.verifyCreatedTransaction(transaction)
    if (!verify.valid) {
      throw new Error(`Invalid transaction, reason: ${String(verify.reason)}`)
    }

    await this.syncTransaction(transaction, { submittedSequence: heaviestHead.sequence })
    memPool.acceptTransaction(transaction)
    this.broadcastTransaction(transaction)
    this.onTransactionCreated.emit(transaction)

    return transaction
  }

  async createTransaction(
    sender: Account,
    receives: { publicAddress: string; amount: bigint; memo: string }[],
    transactionFee: bigint,
    expirationSequence: number,
  ): Promise<Transaction> {
    const unlock = await this.createTransactionMutex.lock()

    try {
      this.assertHasAccount(sender)

      if (!this.isAccountUpToDate(sender)) {
        throw new Error('Your account must finish scanning before sending a transaction.')
      }

      const amountNeeded =
        receives.reduce((acc, receive) => acc + receive.amount, BigInt(0)) + transactionFee

      const { amount, notesToSpend } = await this.createSpends(sender, amountNeeded)

      if (amount < amountNeeded) {
        throw new NotEnoughFundsError(
          `Insufficient funds: Needed ${amountNeeded.toString()} but have ${amount.toString()}`,
        )
      }

      return this.workerPool.createTransaction(
        sender.spendingKey,
        transactionFee,
        notesToSpend.map((n) => ({
          note: n.note,
          treeSize: n.witness.treeSize(),
          authPath: n.witness.authenticationPath,
          rootHash: n.witness.rootHash,
        })),
        receives,
        expirationSequence,
      )
    } finally {
      unlock()
    }
  }

  async createSpends(
    sender: Account,
    amountNeeded: bigint,
  ): Promise<{ amount: bigint; notesToSpend: Array<{ note: Note; witness: NoteWitness }> }> {
    let amount = BigInt(0)

    const notesToSpend: Array<{ note: Note; witness: NoteWitness }> = []

    for await (const unspentNote of this.getUnspentNotes(sender)) {
      if (unspentNote.note.value() <= BigInt(0)) {
        continue
      }

      Assert.isNotNull(unspentNote.index)
      Assert.isNotNull(unspentNote.nullifier)

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
      notesToSpend.push({ note: unspentNote.note, witness: witness })
      amount += unspentNote.note.value()

      if (amount >= amountNeeded) {
        break
      }
    }

    return {
      amount,
      notesToSpend,
    }
  }

  /**
   * Checks if a note is already on the chain when trying to spend it
   *
   * This function should be deleted once the wallet is detached from the chain,
   * either way. It shouldn't be neccessary. It's just a hold over function to
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
      await sender.updateDecryptedNote(unspentNote.hash, {
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

      for await (const transactionInfo of account.getTransactions()) {
        if (this.eventLoopAbortController.signal.aborted) {
          return
        }

        const { transaction, blockHash, submittedSequence } = transactionInfo
        const transactionHash = transaction.hash()

        // Skip transactions that are already added to a block
        if (blockHash) {
          continue
        }

        // Skip expired transactions
        if (
          this.chain.verifier.isExpiredSequence(
            transaction.expirationSequence(),
            this.chain.head.sequence,
          )
        ) {
          continue
        }

        // TODO: Submitted sequence is only set from transactions generated by this node and we don't rebroadcast
        // transactions to us, or from us and generated from another node, but we should do this later. It
        // will require us to set submittedSequence in syncTransaction to the current head if it's null
        if (!submittedSequence) {
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
          await account.updateTransaction(
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
      minimumBlockConfirmations?: number
    },
    tx?: IDatabaseTransaction,
  ): Promise<TransactionStatus> {
    const minimumBlockConfirmations =
      options?.minimumBlockConfirmations ?? this.config.get('minimumBlockConfirmations')

    const headSequence =
      options?.headSequence ?? (await this.getAccountHeadSequence(account, tx))

    if (!headSequence) {
      return TransactionStatus.UNKNOWN
    }

    if (transaction.sequence) {
      const isConfirmed = headSequence - transaction.sequence >= minimumBlockConfirmations

      return isConfirmed ? TransactionStatus.CONFIRMED : TransactionStatus.UNCONFIRMED
    } else {
      const isExpired = this.chain.verifier.isExpiredSequence(
        transaction.transaction.expirationSequence(),
        headSequence,
      )

      return isExpired ? TransactionStatus.EXPIRED : TransactionStatus.PENDING
    }
  }

  async createAccount(name: string, setDefault = false): Promise<Account> {
    if (this.getAccountByName(name)) {
      throw new Error(`Account already exists with the name ${name}`)
    }

    const key = generateKey()

    const account = new Account({
      id: uuid(),
      name,
      incomingViewKey: key.incoming_view_key,
      outgoingViewKey: key.outgoing_view_key,
      publicAddress: key.public_address,
      spendingKey: key.spending_key,
      walletDb: this.walletDb,
    })

    await this.walletDb.db.transaction(async (tx) => {
      await this.walletDb.setAccount(account, tx)
      await this.updateHeadHash(account, this.chainProcessor.hash, tx)
    })

    this.accounts.set(account.id, account)

    if (setDefault) {
      await this.setDefaultAccount(account.name)
    }

    return account
  }

  async skipRescan(account: Account): Promise<void> {
    await this.updateHeadHash(account, this.chainProcessor.hash)
  }

  async importAccount(toImport: Omit<AccountValue, 'rescan' | 'id'>): Promise<Account> {
    validateAccount(toImport)

    if (toImport.name && this.getAccountByName(toImport.name)) {
      throw new Error(`Account already exists with the name ${toImport.name}`)
    }

    if (this.listAccounts().find((a) => toImport.spendingKey === a.spendingKey)) {
      throw new Error(`Account already exists with provided spending key`)
    }

    const account = new Account({
      ...toImport,
      id: uuid(),
      walletDb: this.walletDb,
    })

    await this.walletDb.db.transaction(async (tx) => {
      await this.walletDb.setAccount(account, tx)
      await this.updateHeadHash(account, null, tx)
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

  async removeAccount(name: string): Promise<void> {
    const account = this.getAccountByName(name)
    if (!account) {
      return
    }

    await this.walletDb.db.transaction(async (tx) => {
      if (account.id === this.defaultAccount) {
        await this.walletDb.setDefaultAccount(null, tx)
        this.defaultAccount = null
      }

      await this.walletDb.removeAccount(account, tx)
      await this.walletDb.removeHeadHash(account, tx)
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

  async getAccountHeadSequence(
    account: Account,
    tx?: IDatabaseTransaction,
  ): Promise<number | null> {
    this.assertHasAccount(account)

    const headHash = await account.getHeadHash(tx)
    if (!headHash) {
      return null
    }

    const header = await this.chain.getHeader(headHash)
    Assert.isNotNull(header, `Missing block header for hash '${headHash.toString('hex')}'`)

    return header.sequence
  }

  getDefaultAccount(): Account | null {
    if (!this.defaultAccount) {
      return null
    }

    return this.getAccount(this.defaultAccount)
  }

  async generateNewPublicAddress(account: Account): Promise<void> {
    this.assertHasAccount(account)
    const key = generateNewPublicAddress(account.spendingKey)
    account.publicAddress = key.public_address
    await this.walletDb.setAccount(account)
  }

  async getEarliestHeadHash(): Promise<Buffer | null> {
    let earliestHeader = null
    for (const account of this.accounts.values()) {
      const headHash = this.headHashes.get(account.id)

      if (!headHash) {
        return null
      }

      const header = await this.chain.getHeader(headHash)

      if (!header) {
        // If no header is returned, the hash is likely invalid and we should remove it
        this.logger.warn(
          `${account.displayName} has an invalid head hash ${headHash.toString(
            'hex',
          )}. This account needs to be rescanned.`,
        )
        await this.updateHeadHash(account, null)
        continue
      }

      if (!earliestHeader || earliestHeader.sequence > header.sequence) {
        earliestHeader = header
      }
    }

    return earliestHeader ? earliestHeader.hash : null
  }

  async getLatestHeadHash(): Promise<Buffer | null> {
    let latestHeader = null

    for (const account of this.accounts.values()) {
      const headHash = this.headHashes.get(account.id)

      if (!headHash) {
        continue
      }

      const header = await this.chain.getHeader(headHash)

      if (!header) {
        this.logger.warn(
          `${account.displayName} has an invalid head hash ${headHash.toString(
            'hex',
          )}. This account needs to be rescanned.`,
        )
        await this.updateHeadHash(account, null)
        continue
      }

      if (!latestHeader || latestHeader.sequence < header.sequence) {
        latestHeader = header
      }
    }

    return latestHeader ? latestHeader.hash : null
  }

  isAccountUpToDate(account: Account): boolean {
    const headHash = this.headHashes.get(account.id)
    Assert.isNotUndefined(
      headHash,
      `isAccountUpToDate: No head hash found for account ${account.displayName}`,
    )

    return BufferUtils.equalsNullable(headHash, this.chainProcessor.hash)
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
