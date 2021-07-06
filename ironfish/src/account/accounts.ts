/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BufferMap } from 'buffer-map'
import { generateKey, generateNewPublicAddress } from 'ironfish-wasm-nodejs'
import { IronfishBlockchain } from '../blockchain'
import { GENESIS_BLOCK_SEQUENCE } from '../consensus'
import { Event } from '../event'
import { createRootLogger, Logger } from '../logger'
import { IronfishMemPool } from '../memPool'
import { IronfishWitness } from '../merkletree/witness'
import { IronfishBlockHeader } from '../primitives/blockheader'
import { IronfishNote } from '../primitives/note'
import { IronfishTransaction } from '../primitives/transaction'
import { ValidationError } from '../rpc/adapters/errors'
import { IDatabaseTransaction } from '../storage'
import { PromiseResolve, PromiseUtils, SetTimeoutToken } from '../utils'
import { WorkerPool } from '../workerPool'
import { Account, AccountDefaults, AccountsDB } from './accountsdb'

const REBROADCAST_SEQUENCE_DELTA = 5

type SyncTransactionParams =
  // Used when receiving a transaction from a block with notes
  // that have been added to the trees
  | { blockHash: string; initialNoteIndex: number }
  // Used if the transaction is not yet part of the chain
  | { submittedSequence: number }
  | Record<string, never>

export class Accounts {
  readonly onDefaultAccountChange = new Event<
    [account: Account | null, oldAccount: Account | null]
  >()

  readonly onBroadcastTransaction = new Event<[transaction: IronfishTransaction]>()

  scan: ScanState | null = null
  updateHeadState: ScanState | null = null

  protected readonly transactionMap = new BufferMap<
    Readonly<{
      transaction: IronfishTransaction
      blockHash: string | null
      submittedSequence: number | null
    }>
  >()
  protected readonly noteToNullifier = new Map<
    string,
    Readonly<{ nullifierHash: string | null; noteIndex: number | null; spent: boolean }>
  >()
  protected readonly nullifierToNote = new Map<string, string>()
  protected readonly accounts = new Map<string, Account>()
  readonly db: AccountsDB
  protected readonly logger: Logger
  readonly workerPool: WorkerPool
  readonly chain: IronfishBlockchain

  protected defaultAccount: string | null = null
  protected headHash: string | null = null
  protected isStarted = false
  protected eventLoopTimeout: SetTimeoutToken | null = null

  constructor({
    chain,
    workerPool,
    database,
    logger = createRootLogger(),
  }: {
    chain: IronfishBlockchain
    workerPool: WorkerPool
    database: AccountsDB
    logger?: Logger
  }) {
    this.chain = chain
    this.logger = logger.withTag('accounts')
    this.db = database
    this.workerPool = workerPool
  }

  async updateHead(): Promise<void> {
    if (this.scan || this.updateHeadState) {
      return
    }

    this.updateHeadState = new ScanState()

    try {
      const addBlock = async (header: IronfishBlockHeader): Promise<void> => {
        this.logger.debug(
          `AccountHead ADD: ${Number(header.sequence) - 1} => ${header.sequence}`,
        )

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
      }

      const removeBlock = async (header: IronfishBlockHeader): Promise<void> => {
        this.logger.debug(
          `AccountHead DEL: ${header.sequence} => ${Number(header.sequence) - 1}`,
        )

        for await (const { transaction } of this.chain.iterateBlockTransactions(header)) {
          await this.syncTransaction(transaction, {})
        }
      }

      const chainHead = this.chain.head
      const chainTail = this.chain.genesis

      if (!this.headHash) {
        await addBlock(chainTail)
        await this.updateHeadHash(chainTail.hash.toString('hex'))
      }

      if (!this.headHash) {
        throw new Error('headHash should be set previously or to chainTail.hash')
      }

      const accountHeadHash = Buffer.from(this.headHash, 'hex')
      const accountHead = await this.chain.getHeader(accountHeadHash)

      if (!accountHead || chainHead.hash.equals(accountHead.hash)) {
        return
      }

      const { fork, isLinear } = await this.chain.findFork(accountHead, chainHead)
      if (!fork) {
        return
      }

      // Remove the old fork chain
      if (!isLinear) {
        for await (const header of this.chain.iterateFrom(
          accountHead,
          fork,
          undefined,
          false,
        )) {
          // Don't remove the fork
          if (!header.hash.equals(fork.hash)) {
            await removeBlock(header)
          }

          await this.updateHeadHash(header.hash.toString('hex'))
        }
      }

      for await (const header of this.chain.iterateTo(fork, chainHead, undefined, false)) {
        if (header.hash.equals(fork.hash)) {
          continue
        }
        await addBlock(header)
        await this.updateHeadHash(header.hash.toString('hex'))
      }

      this.logger.debug(
        '\nUpdated Head: \n',
        `Fork: ${fork.hash.toString('hex')} (${
          fork.sequence === GENESIS_BLOCK_SEQUENCE ? 'GENESIS' : '???'
        })`,
        '\n',
        'Account:',
        accountHead?.hash.toString('hex'),
        '\n',
        'Chain:',
        chainHead?.hash.toString('hex'),
        '\n',
      )
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

  start(): void {
    if (this.isStarted) {
      return
    }
    this.isStarted = true

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
      await this.saveTransactionsToDb()
      await this.db.setHeadHash(this.headHash)
    }
  }

  async eventLoop(): Promise<void> {
    if (!this.isStarted) {
      return
    }

    await this.updateHead()

    await this.rebroadcastTransactions()

    if (this.isStarted) {
      this.eventLoopTimeout = setTimeout(() => void this.eventLoop(), 1000)
    }
  }

  async loadTransactionsFromDb(): Promise<void> {
    await this.db.loadNullifierToNoteMap(this.nullifierToNote)
    await this.db.loadNoteToNullifierMap(this.noteToNullifier)
    await this.db.loadTransactionsIntoMap(this.transactionMap)
  }

  async saveTransactionsToDb(): Promise<void> {
    await this.db.replaceNullifierToNoteMap(this.nullifierToNote)
    await this.db.replaceNoteToNullifierMap(this.noteToNullifier)
    await this.db.replaceTransactions(this.transactionMap)
  }

  async updateTransactionMap(
    transactionHash: Buffer,
    transaction: Readonly<{
      transaction: IronfishTransaction
      blockHash: string | null
      submittedSequence: number | null
    }>,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    this.transactionMap.set(transactionHash, transaction)
    await this.db.saveTransaction(transactionHash, transaction, tx)
  }

  async updateNullifierToNoteMap(
    nullifier: string,
    note: string,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    this.nullifierToNote.set(nullifier, note)
    await this.db.saveNullifierToNote(nullifier, note, tx)
  }

  async updateNoteToNullifierMap(
    noteHash: string,
    note: Readonly<{
      nullifierHash: string | null
      noteIndex: number | null
      spent: boolean
    }>,
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    this.noteToNullifier.set(noteHash, note)
    await this.db.saveNoteToNullifier(noteHash, note, tx)
  }

  async updateHeadHash(headHash: string | null): Promise<void> {
    this.headHash = headHash
    await this.db.setHeadHash(headHash)
  }

  async reset(): Promise<void> {
    this.transactionMap.clear()
    this.noteToNullifier.clear()
    this.nullifierToNote.clear()
    await this.saveTransactionsToDb()
  }

  private decryptNotes(
    transaction: IronfishTransaction,
    initialNoteIndex: number | null,
  ): Array<{
    noteIndex: number | null
    nullifier: string | null
    merkleHash: string
    forSpender: boolean
    account: Account
  }> {
    const accounts = this.listAccounts()
    const notes = new Array<{
      noteIndex: number | null
      nullifier: string | null
      merkleHash: string
      forSpender: boolean
      account: Account
    }>()

    // Decrement the note index before starting so we can
    // pre-increment it in the loop rather than post-incrementing it
    let currentNoteIndex = initialNoteIndex
    if (currentNoteIndex !== null) {
      currentNoteIndex--
    }

    for (const note of transaction.notes()) {
      // Increment the note index if it is set
      if (currentNoteIndex !== null) {
        currentNoteIndex++
      }

      for (const account of accounts) {
        // Try decrypting the note as the owner
        const receivedNote = note.decryptNoteForOwner(account.incomingViewKey)
        if (receivedNote) {
          if (receivedNote.value() !== BigInt(0)) {
            notes.push({
              noteIndex: currentNoteIndex,
              forSpender: false,
              merkleHash: note.merkleHash().toString('hex'),
              nullifier:
                currentNoteIndex !== null
                  ? Buffer.from(
                      receivedNote.nullifier(account.spendingKey, BigInt(currentNoteIndex)),
                    ).toString('hex')
                  : null,
              account: account,
            })
          }
          continue
        }

        // Try decrypting the note as the spender
        const spentNote = note.decryptNoteForSpender(account.outgoingViewKey)
        if (spentNote) {
          if (spentNote.value() !== BigInt(0)) {
            notes.push({
              noteIndex: currentNoteIndex,
              forSpender: true,
              merkleHash: note.merkleHash().toString('hex'),
              nullifier: null,
              account: account,
            })
          }
          continue
        }
      }
    }

    return notes
  }

  /**
   * Called:
   *  - Called when transactions are added to the mem pool
   *  - Called for transactions on disconnected blocks
   *  - Called when transactions are added to a block on the genesis chain
   */
  async syncTransaction(
    transaction: IronfishTransaction,
    params: SyncTransactionParams,
  ): Promise<void> {
    const initialNoteIndex = 'initialNoteIndex' in params ? params.initialNoteIndex : null
    const blockHash = 'blockHash' in params ? params.blockHash : null
    const submittedSequence = 'submittedSequence' in params ? params.submittedSequence : null

    let newSequence = submittedSequence

    await transaction.withReference(() => {
      const notes = this.decryptNotes(transaction, initialNoteIndex)

      return this.db.database.transaction(async (tx) => {
        if (notes.length > 0) {
          const transactionHash = transaction.transactionHash()

          const existingT = this.transactionMap.get(transactionHash)
          // If we passed in a submittedSequence, set submittedSequence to that value.
          // Otherwise, if we already have a submittedSequence, keep that value regardless of whether
          //   submittedSequence was passed in.
          // Otherwise, we don't have an existing sequence or new sequence, so set submittedSequence null
          newSequence = submittedSequence || existingT?.submittedSequence || null

          // The transaction is useful if we want to display transaction history,
          // but since we spent the note, we don't need to put it in the nullifierToNote mappings
          await this.updateTransactionMap(
            transactionHash,
            {
              transaction,
              blockHash,
              submittedSequence: newSequence,
            },
            tx,
          )
        }

        for (const { noteIndex, nullifier, forSpender, merkleHash } of notes) {
          // The transaction is useful if we want to display transaction history,
          // but since we spent the note, we don't need to put it in the nullifierToNote mappings
          if (!forSpender) {
            if (nullifier !== null) {
              await this.updateNullifierToNoteMap(nullifier, merkleHash, tx)
            }

            await this.updateNoteToNullifierMap(
              merkleHash,
              {
                nullifierHash: nullifier,
                noteIndex: noteIndex,
                spent: false,
              },
              tx,
            )
          }
        }

        // If newSequence is null and blockHash is null, we're removing the transaction from
        // the chain and it wasn't created by us, so unmark notes as spent
        const isRemovingTransaction = newSequence === null && blockHash === null

        for (const spend of transaction.spends()) {
          const nullifier = spend.nullifier.toString('hex')
          const noteHash = this.nullifierToNote.get(nullifier)

          if (noteHash) {
            const nullifier = this.noteToNullifier.get(noteHash)

            if (!nullifier) {
              throw new Error(
                'nullifierToNote mappings must have a corresponding noteToNullifier map',
              )
            }

            await this.updateNoteToNullifierMap(noteHash, {
              ...nullifier,
              spent: !isRemovingTransaction,
            })
          }
        }
      })
    })
  }

  async scanTransactions(): Promise<void> {
    if (this.scan) {
      this.logger.info('Skipping Scan, already scanning.')
      return
    }

    if (this.headHash === null) {
      this.logger.info('Skipping scan, there is no blocks to scan')
      return
    }

    const started = Date.now()
    this.scan = new ScanState()

    // If were updating the account head we need to wait until its finished
    // but setting this.scan is our lock so updating the head doesn't run again
    await this.updateHeadState?.wait()

    const accountHeadHash = Buffer.from(this.headHash, 'hex')

    const scanFor = Array.from(this.accounts.values())
      .filter((a) => a.rescan !== null && a.rescan <= started)
      .map((a) => a.name)
      .join(', ')

    this.logger.info(`Scanning for transactions${scanFor ? ` for ${scanFor}` : ''}`)

    // Go through every transaction in the chain and add notes that we can decrypt
    for await (const {
      blockHash,
      transaction,
      initialNoteIndex,
      sequence,
    } of this.chain.iterateAllTransactions(accountHeadHash)) {
      if (this.scan.isAborted) {
        this.scan.signalComplete()
        this.scan = null
        return
      }

      await this.syncTransaction(transaction, { blockHash, initialNoteIndex: initialNoteIndex })
      this.scan.onTransaction.emit(sequence)
    }

    this.logger.info(
      `Finished scanning for transactions after ${Math.floor(
        (Date.now() - started) / 1000,
      )} seconds`,
    )

    for (const account of this.accounts.values()) {
      if (account.rescan !== null && account.rescan <= started) {
        account.rescan = null
        await this.db.setAccount(account)
      }
    }

    this.scan.signalComplete()
    this.scan = null
  }

  private getUnspentNotes(
    account: Account,
  ): ReadonlyArray<{ hash: string; note: IronfishNote; index: number | null }> {
    const unspentNotes = []

    for (const transactionMapValue of this.transactionMap.values()) {
      for (const note of transactionMapValue.transaction.notes()) {
        // Notes can be spent and received by the same Account.
        // Try decrypting the note as its owner
        const receivedNote = note.decryptNoteForOwner(account.incomingViewKey)
        if (receivedNote) {
          const noteHashHex = Buffer.from(note.merkleHash()).toString('hex')

          const map = this.noteToNullifier.get(noteHashHex)
          if (!map) {
            throw new Error('All decryptable notes should be in the noteToNullifier map')
          }

          if (!map.spent) {
            unspentNotes.push({
              hash: noteHashHex,
              note: receivedNote,
              index: map.noteIndex,
            })
          }
        }
      }
    }

    return unspentNotes
  }

  getBalance(account: Account): { unconfirmedBalance: BigInt; confirmedBalance: BigInt } {
    this.assertHasAccount(account)

    const notes = this.getUnspentNotes(account)

    let unconfirmedBalance = BigInt(0)
    let confirmedBalance = BigInt(0)

    for (const note of notes) {
      const value = note.note.value()
      unconfirmedBalance += value
      if (note.index !== null) {
        confirmedBalance += value
      }
    }

    return { unconfirmedBalance, confirmedBalance }
  }

  async pay(
    memPool: IronfishMemPool,
    sender: Account,
    amount: bigint,
    transactionFee: bigint,
    memo: string,
    receiverPublicAddress: string,
  ): Promise<IronfishTransaction> {
    const heaviestHead = this.chain.head
    if (heaviestHead === null) {
      throw new ValidationError('You must have a genesis block to create a transaction')
    }

    const transaction = await this.createTransaction(
      sender,
      amount,
      transactionFee,
      memo,
      receiverPublicAddress,
    )

    await this.syncTransaction(transaction, { submittedSequence: heaviestHead.sequence })
    memPool.acceptTransaction(transaction)
    this.broadcastTransaction(transaction)

    return transaction
  }

  async createTransaction(
    sender: Account,
    amount: bigint,
    transactionFee: bigint,
    memo: string,
    receiverPublicAddress: string,
  ): Promise<IronfishTransaction> {
    this.assertHasAccount(sender)

    let amountNeeded = amount + transactionFee

    const notesToSpend: Array<{ note: IronfishNote; witness: IronfishWitness }> = []
    const unspentNotes = this.getUnspentNotes(sender)

    for (const unspentNote of unspentNotes) {
      // Skip unconfirmed notes
      if (unspentNote.index === null) {
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
          const noteMapValue = this.noteToNullifier.get(nullifier.toString('hex'))
          if (noteMapValue) {
            this.logger.debug(`Unspent note has index ${String(noteMapValue.noteIndex)}`)
            await this.updateNoteToNullifierMap(nullifier.toString('hex'), {
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
          'Accounts: spending note',
          unspentNote.index,
          unspentNote.hash,
          unspentNote.note.value(),
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
      [
        {
          publicAddress: receiverPublicAddress,
          amount,
          memo,
        },
      ],
    )
  }

  broadcastTransaction(transaction: IronfishTransaction): void {
    this.onBroadcastTransaction.emit(transaction)
  }

  async rebroadcastTransactions(): Promise<void> {
    if (!this.isStarted) {
      return
    }

    if (!this.chain.synced) {
      return
    }

    const heaviestHead = this.chain.head
    if (heaviestHead === null) {
      return
    }

    const headSequence = heaviestHead.sequence

    for (const [transactionHash, tx] of this.transactionMap) {
      const { transaction, blockHash, submittedSequence } = tx

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

      // TODO: This algorithm suffers a deanonim attack where you can watch to see what transactions node continously
      // send out, then you can know those transactions are theres. This should be randomized and made less,
      // predictable later to help prevent that attack.
      if (headSequence - submittedSequence < REBROADCAST_SEQUENCE_DELTA) {
        continue
      }

      await this.updateTransactionMap(transactionHash, {
        ...tx,
        submittedSequence: headSequence,
      })

      this.broadcastTransaction(transaction)
    }
  }

  async createAccount(name: string, setDefault = false): Promise<Account> {
    if (this.accounts.has(name)) {
      throw new Error(`Account already exists with the name ${name}`)
    }

    const key = generateKey()

    const account: Account = {
      ...AccountDefaults,
      name: name,
      incomingViewKey: key.incoming_view_key,
      outgoingViewKey: key.outgoing_view_key,
      publicAddress: key.public_address,
      spendingKey: key.spending_key,
    }

    this.accounts.set(account.name, account)
    await this.db.setAccount(account)

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

  async importAccount(toImport: Partial<Account>): Promise<Account> {
    if (!toImport.name) {
      throw new Error(`Imported account has no name`)
    }

    if (this.accounts.has(toImport.name)) {
      throw new Error(`Account already exists with the name ${toImport.name}`)
    }

    const account = {
      ...AccountDefaults,
      ...toImport,
    }

    this.accounts.set(account.name, account)
    await this.db.setAccount(account)

    return account
  }

  listAccounts(): Account[] {
    return Array.from(this.accounts.values())
  }

  accountExists(name: string): boolean {
    return this.accounts.has(name)
  }

  async removeAccount(name: string): Promise<void> {
    if (name === this.defaultAccount) {
      const prev = this.getDefaultAccount()
      await this.db.setDefaultAccount(null)

      this.defaultAccount = null
      this.onDefaultAccountChange.emit(null, prev)
    }

    this.accounts.delete(name)
    await this.db.removeAccount(name)
  }

  get hasDefaultAccount(): boolean {
    return !!this.defaultAccount
  }

  /** Set or clear the default account */
  async setDefaultAccount(name: string | null): Promise<void> {
    if (this.defaultAccount === name) {
      return
    }

    const prev = this.getDefaultAccount()
    let next = null

    if (name !== null) {
      next = this.accounts.get(name)

      if (!next) {
        throw new Error(`No account found with name ${name}`)
      }
    }

    const nextName = next ? next.name : null
    await this.db.setDefaultAccount(nextName)
    this.defaultAccount = nextName
    this.onDefaultAccountChange.emit(next, prev)
  }

  getAccountByName(name: string): Account | null {
    return this.accounts.get(name) || null
  }

  getDefaultAccount(): Account | null {
    if (!this.defaultAccount) {
      return null
    }
    return this.getAccountByName(this.defaultAccount)
  }

  async generateNewPublicAddress(account: Account): Promise<void> {
    this.assertHasAccount(account)
    const key = generateNewPublicAddress(account.spendingKey)
    account.publicAddress = key.public_address
    await this.db.setAccount(account)
  }

  async load(): Promise<void> {
    for await (const account of this.db.loadAccounts()) {
      this.accounts.set(account.name, account)
    }

    const meta = await this.db.loadAccountsMeta()
    this.defaultAccount = meta.defaultAccountName
    this.headHash = meta.headHash

    await this.loadTransactionsFromDb()
  }

  protected assertHasAccount(account: Account): void {
    if (!this.accounts.has(account.name)) {
      throw new Error(`No account found with name ${account.name}`)
    }
  }

  protected assertNotHasAccount(account: Account): void {
    if (this.accounts.has(account.name)) {
      throw new Error(`No account found with name ${account.name}`)
    }
  }
}

export class ScanState {
  onTransaction = new Event<[sequence: number]>()

  private aborted: boolean
  private runningPromise: Promise<void>
  private runningResolve: PromiseResolve<void>

  constructor() {
    const [promise, resolve] = PromiseUtils.split<void>()
    this.runningPromise = promise
    this.runningResolve = resolve

    this.aborted = false
  }

  get isAborted(): boolean {
    return this.aborted
  }

  signalComplete(): void {
    this.runningResolve()
  }

  async abort(): Promise<void> {
    this.aborted = true
    return this.wait()
  }

  wait(): Promise<void> {
    return this.runningPromise
  }
}
