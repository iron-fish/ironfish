/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { Blockchain } from '../../blockchain'
import type { RpcClient } from '../../rpc'
import type { Account } from '../account/account'
import type { Wallet } from '../wallet'
import type { HeadValue } from '../walletdb/headValue'
import { Config } from '../../fileStores'
import { Logger } from '../../logger'
import { Mutex } from '../../mutex'
import { BlockHeader, GENESIS_BLOCK_SEQUENCE, Transaction } from '../../primitives'
import { HashUtils } from '../../utils'
import { WorkerPool } from '../../workerPool'
import { ChainProcessorWithTransactions } from './chainProcessorWithTransactions'
import { BackgroundNoteDecryptor } from './noteDecryptor'
import { RemoteChainProcessor } from './remoteChainProcessor'
import { ScanState } from './scanState'

export class WalletScanner {
  readonly logger: Logger
  readonly wallet: Wallet
  readonly workerPool: WorkerPool
  readonly config: Config

  readonly chain: Blockchain | null = null
  readonly nodeClient: RpcClient | null = null

  state: ScanState | null = null
  lock: Mutex = new Mutex()

  /**
   * A snapshot of the accounts that have `scanningEnabled` set to true. Used
   * to tell what accounts should be scanned, and from what block.
   */
  private scanningAccounts = new Array<{
    account: Account
    scanFrom: { sequence: number; hash?: Buffer } | 'cursor'
  }>()

  constructor(options: {
    logger: Logger
    wallet: Wallet
    workerPool: WorkerPool
    config: Config
    nodeClient?: RpcClient | null
    chain?: Blockchain | null
  }) {
    this.logger = options.logger
    this.wallet = options.wallet
    this.workerPool = options.workerPool
    this.config = options.config
    this.chain = options.chain ?? null
    this.nodeClient = options.nodeClient ?? null
  }

  get running(): boolean {
    return !!this.state
  }

  async abort(): Promise<void> {
    if (this.state) {
      await this.state.abort()
    }
  }

  async wait(): Promise<void> {
    if (this.state) {
      await this.state.wait()
    }
  }

  async scan(): Promise<ScanState> {
    const unlock = await this.lock.lock()

    if (this.state) {
      return this.state
    }

    try {
      await this.refreshScanningAccounts()
      const start = await this.getEarliestHead()
      const end = await this.wallet.getChainHead()
      if (start === 'none') {
        return new ScanState(end, end)
      }

      const decryptor = new BackgroundNoteDecryptor(this.workerPool, this.config, {
        decryptForSpender: false,
        skipNoteValidation: true,
      })

      const chainProcessor = this.getChainProcessor(start)

      chainProcessor.onAdd.on(async ({ header, transactions }) => {
        await this.connectBlock(header, transactions, decryptor, this.state?.abortController)
        this.state?.signal(header, 'connect')
      })

      chainProcessor.onRemove.on(async ({ header, transactions }) => {
        await this.disconnectBlock(header, transactions, this.state?.abortController)
        this.state?.signal(header, 'disconnect')
      })

      // Once we set up ChainProcessor, if the start is null we want to use
      // genesis head for the ScanState for proper progress tracking
      const scanStart = start ?? (await this.wallet.getChainGenesis())
      const scan = new ScanState(scanStart, end)

      this.state = scan
      unlock()

      const logScanState = scan.start.sequence !== scan.end.sequence
      if (logScanState) {
        this.logger.debug(
          `Scan starting from block ${scan.start.sequence} to ${scan.end.sequence}`,
        )
      }

      decryptor.start(scan.abortController)

      void (async () => {
        let hashChanged = true

        while (hashChanged) {
          if (scan.abortController.signal.aborted) {
            return
          }

          if (this.haveWalletAccountsChanged()) {
            // Accounts have changed in the wallet. Wait for all pending
            // decrypt requests to be completed, then update the head of the
            // chain processor.
            await decryptor.flush()
            await this.refreshScanningAccounts()
            const head = await this.getEarliestHead()
            if (head === 'none') {
              break
            }
            chainProcessor.hash = head?.hash ?? null
          }

          const result = await chainProcessor.update({ signal: scan.abortController.signal })
          hashChanged = result.hashChanged
        }

        await decryptor.flush()
      })()
        .then(() => {
          if (logScanState) {
            this.logger.debug(
              `Finished scanning for transactions after ${Math.floor(
                (Date.now() - scan.startedAt) / 1000,
              )} seconds`,
            )
          }
        })
        .finally(() => {
          decryptor.stop()

          if (this.state === scan) {
            this.state = null
          }

          scan.signalComplete()
        })

      return scan
    } finally {
      unlock()
    }
  }

  async connectBlock(
    blockHeader: BlockHeader,
    transactions: Transaction[],
    decryptor: BackgroundNoteDecryptor,
    abort?: AbortController,
  ): Promise<void> {
    if (blockHeader.sequence % 100 === 0) {
      this.logger.info(
        'Added block' +
          ` seq: ${blockHeader.sequence},` +
          ` hash: ${HashUtils.renderHash(blockHeader.hash)}`,
      )
    }

    for (const candidate of this.scanningAccounts) {
      const { scanFrom } = candidate

      if (scanFrom === 'cursor') {
        continue
      }

      if (!scanFrom.hash && blockHeader.sequence >= scanFrom.sequence) {
        candidate.scanFrom = 'cursor'
      }

      if (scanFrom.hash?.equals(blockHeader.previousBlockHash)) {
        candidate.scanFrom = 'cursor'
      }
    }

    const decryptAndConnectAccounts = this.scanningAccounts
      .filter(({ scanFrom }) => scanFrom === 'cursor')
      .map(({ account }) => account)

    if (abort?.signal.aborted) {
      return
    }

    return decryptor.decryptNotesFromBlock(
      blockHeader,
      transactions,
      decryptAndConnectAccounts,
      async (account, blockHeader, transactions) => {
        if (abort?.signal.aborted) {
          return
        }
        await this.wallet.connectBlockForAccount(account, blockHeader, transactions, true)
      },
    )
  }

  private async disconnectBlock(
    header: BlockHeader,
    transactions: Transaction[],
    abort?: AbortController,
  ): Promise<void> {
    this.logger.debug(`AccountHead DEL: ${header.sequence} => ${Number(header.sequence) - 1}`)

    const accounts = (await this.getScanningAccountsWithHead()).filter(({ head }) =>
      head?.hash?.equals(header.hash),
    )

    for (const { account } of accounts) {
      if (abort?.signal.aborted) {
        return
      }
      await this.wallet.disconnectBlockForAccount(account, header, transactions)
    }

    for (const account of this.scanningAccounts) {
      if (account.scanFrom === 'cursor') {
        continue
      }

      if (account.scanFrom.hash?.equals(header.hash)) {
        account.scanFrom = 'cursor'
      }
    }
  }

  getChainProcessor(
    start: HeadValue | null,
  ): ChainProcessorWithTransactions | RemoteChainProcessor {
    const head = start?.hash ?? null

    if (this.chain) {
      return new ChainProcessorWithTransactions({
        logger: this.logger,
        chain: this.chain,
        maxQueueSize: this.config.get('walletSyncingMaxQueueSize'),
        head,
      })
    }

    if (this.nodeClient) {
      return new RemoteChainProcessor({
        logger: this.logger,
        nodeClient: this.nodeClient,
        maxQueueSize: this.config.get('walletSyncingMaxQueueSize'),
        head,
      })
    }

    throw new Error('WalletScanner requires either chain or client')
  }

  /**
   * Checks whether `scanningAccounts` is stale or up-to-date.
   */
  private haveWalletAccountsChanged(): boolean {
    const accountIds = new Set(
      this.wallet.accounts
        .filter((account) => account.scanningEnabled)
        .map((account) => account.id),
    )
    return (
      this.scanningAccounts.length !== accountIds.size ||
      !this.scanningAccounts.every(({ account }) => accountIds.has(account.id))
    )
  }

  private getScanningAccountsWithHead(): Promise<
    Array<{ account: Account; head: HeadValue | null }>
  > {
    return this.wallet.walletDb.db.withTransaction(null, async (tx) =>
      Promise.all(
        this.wallet.accounts
          .filter((account) => account.scanningEnabled)
          .map(async (account) => ({
            account,
            head: await account.getHead(tx),
          })),
      ),
    )
  }

  /**
   * Replaces `scanningAccounts` with fresh values from the wallet.
   */
  private async refreshScanningAccounts(): Promise<void> {
    this.scanningAccounts = (await this.getScanningAccountsWithHead()).map(
      ({ account, head }) => {
        const scanFrom = head || {
          sequence: (account.createdAt?.sequence ?? GENESIS_BLOCK_SEQUENCE) - 1,
        }
        return { account, scanFrom }
      },
    )
  }

  private async getEarliestHead(): Promise<HeadValue | null | 'none'> {
    let earliestHead: { sequence: number; hash?: Buffer } | null = null
    for (const { scanFrom } of this.scanningAccounts) {
      if (scanFrom === 'cursor') {
        continue
      }

      if (!earliestHead || scanFrom.sequence < earliestHead.sequence) {
        earliestHead = scanFrom
      }
    }

    if (!earliestHead) {
      return 'none'
    }

    if (earliestHead.sequence < GENESIS_BLOCK_SEQUENCE) {
      return null
    }

    if (!earliestHead.hash) {
      const atSequence = await this.wallet.accountHeadAtSequence(earliestHead.sequence)
      return atSequence ?? 'none'
    }

    return { hash: earliestHead.hash, sequence: earliestHead.sequence }
  }
}
