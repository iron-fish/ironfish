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
import { Note } from '../primitives/note'
import { Transaction } from '../primitives/transaction'
import { ValidationError } from '../rpc/adapters/errors'
import { PromiseResolve, PromiseUtils, SetTimeoutToken } from '../utils'
import { WorkerPool } from '../workerPool'
import { DecryptNoteOptions } from '../workerPool/tasks/decryptNotes'
import { Account } from './account'
import { AccountsDB } from './accountsdb'
import { AccountsValue } from './database/accounts'
import { validateAccount } from './validator'

export type SyncTransactionParams =
  // Used when receiving a transaction from a block with notes
  // that have been added to the trees
  | { blockHash: string; initialNoteIndex: number }
  // Used if the transaction is not yet part of the chain
  | { submittedSequence: number }
  | Record<string, never>

export class Accounts {
  readonly onAccountImported = new Event<[account: Account]>()
  readonly onAccountRemoved = new Event<[account: Account]>()
  readonly onBroadcastTransaction = new Event<[transaction: Transaction]>()

  scan: ScanState | null = null
  updateHeadState: ScanState | null = null

  protected readonly headStatus = new Map<
    string,
    { headHash: string | null; upToDate: boolean }
  >()

  protected readonly accounts = new Map<string, Account>()
  readonly db: AccountsDB
  protected readonly logger: Logger
  readonly workerPool: WorkerPool
  readonly chain: Blockchain
  private readonly config: Config

  protected rebroadcastAfter: number
  protected defaultAccount: string | null = null
  protected chainProcessor: ChainProcessor
  protected isStarted = false
  protected isOpen = false
  protected eventLoopTimeout: SetTimeoutToken | null = null

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
    database: AccountsDB
    logger?: Logger
    rebroadcastAfter?: number
    workerPool: WorkerPool
  }) {
    this.chain = chain
    this.config = config
    this.logger = logger.withTag('accounts')
    this.db = database
    this.workerPool = workerPool
    this.rebroadcastAfter = rebroadcastAfter ?? 10

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
        initialNoteIndex,
      } of this.chain.iterateBlockTransactions(header)) {
        await this.syncTransaction(transaction, {
          blockHash: blockHash,
          initialNoteIndex: initialNoteIndex,
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

    this.updateHeadState = new ScanState()

    try {
      const { hashChanged } = await this.chainProcessor.update({
        signal: this.updateHeadState.abortController.signal,
      })

      if (hashChanged) {
        this.logger.debug(
          `Updated Accounts Head: ${String(this.chainProcessor.hash?.toString('hex'))}`,
        )
      }
    } finally {
      this.updateHeadState.signalComplete()
      this.updateHeadState = null
    }
  }

  get shouldRescan(): boolean {
    if (this.scan) {
      return false
    }

    for (const account of this.accounts.values()) {
      if (account.rescan !== null) {
        return true
      }
    }

    return false
  }

  async open(
    options: { upgrade?: boolean; load?: boolean } = { upgrade: true, load: true },
  ): Promise<void> {
    if (this.isOpen) {
      return
    }

    this.isOpen = true
    await this.db.open(options)

    if (options.load) {
      await this.load()
    }
  }

  async load(): Promise<void> {
    for await (const { id, serializedAccount } of this.db.loadAccounts()) {
      const account = new Account({
        ...serializedAccount,
        id,
        accountsDb: this.db,
      })

      this.accounts.set(id, account)
    }

    const meta = await this.db.loadAccountsMeta()
    this.defaultAccount = meta.defaultAccountId

    await this.loadHeadHashes()
    this.chainProcessor.hash = await this.getLatestHeadHash()

    await this.loadAccountsFromDb()
  }

  async close(): Promise<void> {
    if (!this.isOpen) {
      return
    }

    this.isOpen = false
    await this.db.close()
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

    if (this.scan) {
      await this.scan.abort()
    }

    if (this.updateHeadState) {
      await this.updateHeadState.abort()
    }

    if (this.db.database.isOpen) {
      await this.saveAccountsToDb()
      await this.updateHeadHashes(this.chainProcessor.hash)
    }
  }

  async eventLoop(): Promise<void> {
    if (!this.isStarted) {
      return
    }

    await this.updateHead()
    await this.expireTransactions()
    await this.rebroadcastTransactions()

    if (this.isStarted) {
      this.eventLoopTimeout = setTimeout(() => void this.eventLoop(), 1000)
    }
  }

  async loadAccountsFromDb(): Promise<void> {
    for (const account of this.accounts.values()) {
      await account.load()
    }
  }

  async saveAccountsToDb(): Promise<void> {
    for (const account of this.accounts.values()) {
      await account.save()
    }
  }

  async updateHeadHashes(headHash: Buffer | null): Promise<void> {
    let accounts
    if (headHash) {
      accounts = this.listAccounts().filter((a) => this.isAccountUpToDate(a))
    } else {
      accounts = this.listAccounts()
    }

    for (const account of accounts) {
      await this.updateHeadHash(account, headHash)
    }
  }

  async updateHeadHash(account: Account, headHash: Buffer | null): Promise<void> {
    const hash = headHash ? headHash.toString('hex') : null

    const headStatus = this.headStatus.get(account.id)
    Assert.isNotUndefined(headStatus)

    headStatus.headHash = hash

    this.headStatus.set(account.id, headStatus)

    await this.db.saveHeadHash(account, hash)
  }

  async reset(): Promise<void> {
    this.resetAccounts()
    this.chainProcessor.hash = null
    await this.saveAccountsToDb()
    await this.updateHeadHashes(null)
  }

  private resetAccounts(): void {
    for (const account of this.accounts.values()) {
      account.reset()
    }
  }

  private async decryptNotes(
    transaction: Transaction,
    initialNoteIndex: number | null,
    accounts?: Array<Account>,
  ): Promise<
    Map<
      string,
      Array<{
        noteIndex: number | null
        nullifier: string | null
        merkleHash: string
        forSpender: boolean
        account: Account
        serializedNote: Buffer
      }>
    >
  > {
    const accountsToCheck =
      accounts || this.listAccounts().filter((a) => this.isAccountUpToDate(a))

    const decryptedNotesByAccountId = new Map<
      string,
      Array<{
        noteIndex: number | null
        nullifier: string | null
        merkleHash: string
        forSpender: boolean
        account: Account
        serializedNote: Buffer
      }>
    >()

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
            account,
            decryptNotesPayloads,
          )
          decryptedNotes.push(...decryptedNotesBatch)
          decryptNotesPayloads = []
        }
      }

      if (decryptNotesPayloads.length) {
        const decryptedNotesBatch = await this.decryptNotesFromTransaction(
          account,
          decryptNotesPayloads,
        )
        decryptedNotes.push(...decryptedNotesBatch)
      }

      if (decryptedNotes.length) {
        decryptedNotesByAccountId.set(account.id, decryptedNotes)
      }
    }

    return decryptedNotesByAccountId
  }

  private async decryptNotesFromTransaction(
    account: Account,
    decryptNotesPayloads: Array<DecryptNoteOptions>,
  ): Promise<
    Array<{
      noteIndex: number | null
      nullifier: string | null
      merkleHash: string
      forSpender: boolean
      account: Account
      serializedNote: Buffer
    }>
  > {
    const decryptedNotes = []
    const response = await this.workerPool.decryptNotes(decryptNotesPayloads)

    for (const decryptedNote of response) {
      if (decryptedNote) {
        decryptedNotes.push({
          account,
          forSpender: decryptedNote.forSpender,
          merkleHash: decryptedNote.merkleHash.toString('hex'),
          noteIndex: decryptedNote.index,
          nullifier: decryptedNote.nullifier ? decryptedNote.nullifier.toString('hex') : null,
          serializedNote: decryptedNote.serializedNote,
        })
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

    await transaction.withReference(async () => {
      const decryptedNotesByAccountId = await this.decryptNotes(
        transaction,
        initialNoteIndex,
        accounts,
      )

      for (const [accountId, decryptedNotes] of decryptedNotesByAccountId) {
        await this.db.database.transaction(async (tx) => {
          const account = this.accounts.get(accountId)
          Assert.isNotUndefined(account)
          await account.syncTransaction(transaction, decryptedNotes, params, tx)
        })
      }
    })
  }

  /**
   * Removes a transaction from the transaction map and updates
   * the related maps.
   */
  async removeTransaction(transaction: Transaction): Promise<void> {
    const transactionHash = transaction.hash()

    for (const account of this.accounts.values()) {
      await this.db.database.transaction(async (tx) => {
        await account.deleteTransaction(transactionHash, transaction, tx)
      })
    }
  }

  async scanTransactions(): Promise<void> {
    if (this.scan) {
      this.logger.info('Skipping scan, already scanning')
      return
    }

    if (this.chainProcessor.hash === null) {
      this.logger.debug('Skipping scan, there are no blocks to scan')
      return
    }

    const scan = new ScanState()
    this.scan = scan

    // If we are updating the account head, we need to wait until its finished
    // but setting this.scan is our lock so updating the head doesn't run again
    await this.updateHeadState?.wait()

    const startHash = await this.getEarliestHeadHash()
    const endHash = this.chainProcessor.hash

    const accounts: Array<Account> = []
    const remainingAccounts: Array<Account> = []

    const startHashHex = startHash ? startHash.toString('hex') : null

    for (const account of this.accounts.values()) {
      const headStatus = this.headStatus.get(account.id)
      Assert.isNotUndefined(headStatus)

      if (startHashHex === headStatus.headHash) {
        accounts.push(account)
      } else {
        remainingAccounts.push(account)
      }
    }

    this.logger.info(
      `Scan starting from earliest found account head hash: ${
        startHash ? startHash.toString('hex') : 'GENESIS'
      }`,
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
          },
          accounts,
        )
        scan.onTransaction.emit(sequence)
      }

      for (const account of accounts) {
        await this.updateHeadHash(account, blockHeader.hash)
      }

      const hashHex = blockHeader.hash.toString('hex')

      let i = 0
      while (i < remainingAccounts.length) {
        const account = remainingAccounts[i]
        const headStatus = this.headStatus.get(account.id)
        Assert.isNotUndefined(headStatus)

        if (headStatus.headHash === hashHex) {
          remainingAccounts.splice(i, 1)
          accounts.push(account)
          this.logger.debug(`Adding ${account.displayName} to scan`)
        } else {
          i += 1
        }
      }
    }

    for (const account of this.accounts.values()) {
      if (account.rescan !== null && account.rescan <= scan.startedAt) {
        account.rescan = null
        await this.db.setAccount(account)
      }

      this.headStatus.set(account.id, {
        headHash: endHash.toString('hex'),
        upToDate: true,
      })
    }

    await this.updateHeadHashes(endHash)

    this.logger.info(
      `Finished scanning for transactions after ${Math.floor(
        (Date.now() - scan.startedAt) / 1000,
      )} seconds`,
    )

    scan.signalComplete()
    this.scan = null
  }

  getNotes(account: Account): {
    notes: {
      spender: boolean
      amount: number
      memo: string
      noteTxHash: string
    }[]
  } {
    this.assertHasAccount(account)

    const notes = []

    for (const { transaction } of account.getTransactions()) {
      for (const note of transaction.notes()) {
        // Try decrypting the note as the owner
        let decryptedNote = note.decryptNoteForOwner(account.incomingViewKey)
        let spender = false

        if (!decryptedNote) {
          // Try decrypting the note as the spender
          decryptedNote = note.decryptNoteForSpender(account.outgoingViewKey)
          spender = true
        }

        if (decryptedNote && decryptedNote.value() !== BigInt(0)) {
          notes.push({
            spender,
            amount: Number(decryptedNote.value()),
            memo: decryptedNote.memo().replace(/\x00/g, ''),
            noteTxHash: transaction.hash().toString('hex'),
          })
        }
      }
    }

    return { notes }
  }

  async getBalance(account: Account): Promise<{ unconfirmed: BigInt; confirmed: BigInt }> {
    this.assertHasAccount(account)

    const notes = await this.getUnspentNotes(account)

    let unconfirmed = BigInt(0)
    let confirmed = BigInt(0)

    for (const note of notes) {
      const value = note.note.value()

      unconfirmed += value

      if (note.index !== null && note.confirmed) {
        confirmed += value
      }
    }

    return { unconfirmed, confirmed }
  }

  private async getUnspentNotes(account: Account): Promise<
    ReadonlyArray<{
      hash: string
      note: Note
      index: number | null
      confirmed: boolean
    }>
  > {
    const minimumBlockConfirmations = this.config.get('minimumBlockConfirmations')
    const notes = []
    const unspentNotes = account.getUnspentNotes()

    for (const { hash, note, index, transactionHash } of unspentNotes) {
      let confirmed = false

      if (transactionHash) {
        const transaction = account.getTransaction(transactionHash)
        Assert.isNotUndefined(transaction, 'test')
        const { blockHash } = transaction

        if (blockHash) {
          const header = await this.chain.getHeader(Buffer.from(blockHash, 'hex'))
          Assert.isNotNull(header)
          const main = await this.chain.isHeadChain(header)
          if (main) {
            const confirmations = this.chain.head.sequence - header.sequence
            confirmed = confirmations >= minimumBlockConfirmations
          }
        }
      }

      notes.push({
        confirmed,
        hash,
        index,
        note,
      })
    }

    return notes
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
      throw new ValidationError('You must have a genesis block to create a transaction')
    }

    expirationSequence =
      expirationSequence ?? heaviestHead.sequence + defaultTransactionExpirationSequenceDelta

    if (this.chain.verifier.isExpiredSequence(expirationSequence, this.chain.head.sequence)) {
      throw new ValidationError('Invalid expiration sequence for transaction')
    }

    const transaction = await this.createTransaction(
      sender,
      receives,
      transactionFee,
      expirationSequence,
    )

    await this.syncTransaction(transaction, { submittedSequence: heaviestHead.sequence })
    await memPool.acceptTransaction(transaction)
    this.broadcastTransaction(transaction)

    return transaction
  }

  async createTransaction(
    sender: Account,
    receives: { publicAddress: string; amount: bigint; memo: string }[],
    transactionFee: bigint,
    expirationSequence: number,
  ): Promise<Transaction> {
    this.assertHasAccount(sender)

    // TODO: If we're spending from multiple accounts, we need to figure out a
    // way to split the transaction fee. - deekerno
    let amountNeeded =
      receives.reduce((acc, receive) => acc + receive.amount, BigInt(0)) + transactionFee

    const notesToSpend: Array<{ note: Note; witness: NoteWitness }> = []
    const unspentNotes = await this.getUnspentNotes(sender)

    for (const unspentNote of unspentNotes) {
      // Skip unconfirmed notes
      if (unspentNote.index === null || !unspentNote.confirmed) {
        continue
      }

      if (unspentNote.note.value() > BigInt(0)) {
        // Double-check that the nullifier for the note isn't in the tree already
        // This would indicate a bug in the account transaction stores
        const nullifier = Buffer.from(
          unspentNote.note.nullifier(sender.spendingKey, BigInt(unspentNote.index)),
        )

        if (await this.chain.nullifiers.contains(nullifier)) {
          this.logger.debug(
            `Note was marked unspent, but nullifier found in tree: ${nullifier.toString(
              'hex',
            )}`,
          )

          // Update our map so this doesn't happen again
          const noteMapValue = sender.getDecryptedNote(unspentNote.hash)
          if (noteMapValue) {
            this.logger.debug(`Unspent note has index ${String(noteMapValue.noteIndex)}`)
            await sender.updateDecryptedNote(unspentNote.hash, {
              ...noteMapValue,
              spent: true,
            })
          }

          // Move on to the next note
          continue
        }

        // Try creating a witness from the note
        const witness = await this.chain.notes.witness(unspentNote.index)

        if (witness === null) {
          this.logger.debug(
            `Could not create a witness for note with index ${unspentNote.index}`,
          )
          continue
        }

        // Otherwise, push the note into the list of notes to spend
        this.logger.debug(
          `Accounts: spending note ${unspentNote.index} ${
            unspentNote.hash
          } ${unspentNote.note.value()}`,
        )
        notesToSpend.push({ note: unspentNote.note, witness: witness })
        amountNeeded -= unspentNote.note.value()
      }

      if (amountNeeded <= 0) {
        break
      }
    }

    if (amountNeeded > 0) {
      throw new Error('Insufficient funds')
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
      for (const tx of account.getTransactions()) {
        const { transaction, blockHash, submittedSequence } = tx
        const transactionHash = transaction.hash()

        // Skip transactions that are already added to a block
        if (blockHash) {
          continue
        }

        // TODO: Submitted sequence is only set from transactions generated by this node and we don't rebroadcast
        // transactions to us, or from us and generated from another node, but we should do this later. It
        // will require us to set submittedSequence in syncTransaction to the current head if it's null
        if (!submittedSequence) {
          continue
        }

        // TODO: This algorithm suffers a deanonymization attack where you can
        // watch to see what transactions node continously send out, then you can
        // know those transactions are theres. This should be randomized and made
        // less, predictable later to help prevent that attack.
        if (head.sequence - submittedSequence < this.rebroadcastAfter) {
          continue
        }

        const verify = await this.chain.verifier.verifyTransactionAdd(transaction)

        // We still update this even if it's not valid to prevent constantly
        // reprocessing valid transaction every block. Give them a few blocks to
        // try to become valid.
        await account.updateTransaction(transactionHash, {
          ...tx,
          submittedSequence: head.sequence,
        })

        if (!verify.valid) {
          this.logger.debug(
            `Ignoring invalid transaction during rebroadcast ${transactionHash.toString(
              'hex',
            )}, reason ${String(verify.reason)} seq: ${head.sequence}`,
          )

          continue
        }

        this.broadcastTransaction(transaction)
      }
    }
  }

  async expireTransactions(): Promise<void> {
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
      for (const { transaction, blockHash } of account.getTransactions()) {
        // Skip transactions that are already added to a block
        if (blockHash) {
          continue
        }

        const isExpired = this.chain.verifier.isExpiredSequence(
          transaction.expirationSequence(),
          head.sequence,
        )

        if (isExpired) {
          await this.removeTransaction(transaction)
        }
      }
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
      rescan: null,
      accountsDb: this.db,
    })

    this.accounts.set(account.id, account)
    await this.db.setAccount(account)

    this.headStatus.set(account.id, {
      headHash: null,
      upToDate: true,
    })
    await this.updateHeadHash(account, this.chainProcessor.hash)

    if (setDefault) {
      await this.setDefaultAccount(account.name)
    }

    return account
  }

  async startScanTransactionsFor(account: Account): Promise<void> {
    account.rescan = Date.now()
    await this.db.setAccount(account)
    await this.scanTransactions()
  }

  getTransaction(
    account: Account,
    hash: string,
  ): {
    transactionInfo: {
      status: string
      isMinersFee: boolean
      fee: number
      notes: number
      spends: number
    } | null
    transactionNotes: {
      spender: boolean
      amount: number
      memo: string
    }[]
  } {
    this.assertHasAccount(account)

    let transactionInfo = null
    const transactionNotes = []

    const transactionValue = account.getTransaction(Buffer.from(hash, 'hex'))

    if (transactionValue) {
      const transaction = transactionValue.transaction

      if (transaction.hash().toString('hex') === hash) {
        for (const note of transaction.notes()) {
          // Try decrypting the note as the owner
          let decryptedNote = note.decryptNoteForOwner(account.incomingViewKey)
          let spender = false

          if (!decryptedNote) {
            // Try decrypting the note as the spender
            decryptedNote = note.decryptNoteForSpender(account.outgoingViewKey)
            spender = true
          }

          if (decryptedNote && decryptedNote.value() !== BigInt(0)) {
            transactionNotes.push({
              spender,
              amount: Number(decryptedNote.value()),
              memo: decryptedNote.memo().replace(/\x00/g, ''),
            })
          }
        }

        if (transactionNotes.length > 0) {
          transactionInfo = {
            status:
              transactionValue.blockHash && transactionValue.submittedSequence
                ? 'completed'
                : 'pending',
            isMinersFee: transaction.isMinersFee(),
            fee: Number(transaction.fee()),
            notes: transaction.notesLength(),
            spends: transaction.spendsLength(),
          }
        }
      }
    }

    return { transactionInfo, transactionNotes }
  }

  async importAccount(toImport: Omit<AccountsValue, 'rescan'>): Promise<Account> {
    validateAccount(toImport)

    if (toImport.name && this.getAccountByName(toImport.name)) {
      throw new Error(`Account already exists with the name ${toImport.name}`)
    }

    const account = new Account({
      ...toImport,
      id: uuid(),
      rescan: null,
      accountsDb: this.db,
    })

    this.accounts.set(account.id, account)
    await this.db.setAccount(account)

    const headHash = this.chainProcessor.hash ? this.chainProcessor.hash.toString('hex') : null
    this.headStatus.set(account.id, {
      headHash,
      upToDate: headHash === null,
    })
    await this.updateHeadHash(account, null)

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

    if (account.id === this.defaultAccount) {
      await this.db.setDefaultAccount(null)

      this.defaultAccount = null
    }

    this.accounts.delete(account.id)
    await this.db.removeAccount(account.id)
    await this.db.removeHeadHash(account)
    this.onAccountRemoved.emit(account)
  }

  get hasDefaultAccount(): boolean {
    return !!this.defaultAccount
  }

  /** Set or clear the default account */
  async setDefaultAccount(name: string | null): Promise<void> {
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
    await this.db.setDefaultAccount(nextId)
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

  async generateNewPublicAddress(account: Account): Promise<void> {
    this.assertHasAccount(account)
    const key = generateNewPublicAddress(account.spendingKey)
    account.publicAddress = key.public_address
    await this.db.setAccount(account)
  }

  async getEarliestHeadHash(): Promise<Buffer | null> {
    let earliestHeader = null
    for (const account of this.accounts.values()) {
      const headStatus = this.headStatus.get(account.id)

      if (!headStatus || !headStatus.headHash) {
        return null
      }

      const header = await this.chain.getHeader(Buffer.from(headStatus.headHash, 'hex'))

      if (!header) {
        // If no header is returned, the hash is likely invalid and we should remove it
        this.logger.warn(
          `${account.displayName} has an invalid head hash ${headStatus.headHash}. This account needs to be rescanned.`,
        )
        await this.db.saveHeadHash(account, null)
        continue
      }

      if (!earliestHeader || earliestHeader.sequence > header.sequence) {
        earliestHeader = header
      }

      // TODO: Check if any hashes are on known-forks
    }

    return earliestHeader ? earliestHeader.hash : null
  }

  async getLatestHeadHash(): Promise<Buffer | null> {
    let latestHeader = null

    for (const { headHash } of this.headStatus.values()) {
      if (!headHash) {
        continue
      }

      const header = await this.chain.getHeader(Buffer.from(headHash, 'hex'))
      Assert.isNotNull(header)

      if (!latestHeader || latestHeader.sequence < header.sequence) {
        latestHeader = header
      }
    }

    return latestHeader ? latestHeader.hash : null
  }

  async loadHeadHashes(): Promise<void> {
    for await (const { accountId, headHash } of this.db.loadHeadHashes()) {
      this.headStatus.set(accountId, {
        headHash,
        upToDate: false,
      })
    }

    const latestHeadHash = await this.getLatestHeadHash()

    for (const account of this.accounts.values()) {
      let headStatus = this.headStatus.get(account.id)

      // TODO: We need this until we have migrations, since there's no way to
      // bootstrap the head status state right now
      if (!headStatus) {
        headStatus = {
          headHash: null,
          upToDate: latestHeadHash === null,
        }
        this.headStatus.set(account.id, headStatus)
        await this.updateHeadHash(account, latestHeadHash)
      }

      if (!latestHeadHash || headStatus.headHash === latestHeadHash.toString('hex')) {
        headStatus.upToDate = true
      } else {
        this.logger.warn(
          `${account.displayName} is not up to date. Account's head hash: ${
            headStatus.headHash ?? 'NULL'
          }. Latest head hash: ${latestHeadHash.toString('hex')}.`,
        )
        this.logger.warn("This account's balance may look incorrect until it is rescanned.")
      }
    }
  }

  isAccountUpToDate(account: Account): boolean {
    const headStatus = this.headStatus.get(account.id)
    return headStatus ? headStatus.upToDate : false
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
  onTransaction = new Event<[sequence: number]>()

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
