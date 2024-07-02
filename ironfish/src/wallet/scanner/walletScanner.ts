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
import { BlockHeader, Transaction } from '../../primitives'
import { BufferUtils, HashUtils } from '../../utils'
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
  private scanningAccounts = new Array<{ account: Account; scanFrom: HeadValue | null }>()

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

      const start = this.getEarliestHead()
      const end = await this.wallet.getChainHead()

      const decryptor = new BackgroundNoteDecryptor(this.workerPool, this.config, {
        decryptForSpender: false,
        skipNoteValidation: true,
      })

      const chainProcessor = this.getChainProcessor(start)

      chainProcessor.onAdd.on(async ({ header, transactions }) => {
        await this.connectBlock(header, transactions, decryptor, this.state?.abortController)
        this.state?.signal(header)
      })

      chainProcessor.onRemove.on(async ({ header, transactions }) => {
        await this.disconnectBlock(header, transactions, this.state?.abortController)
        this.state?.signal(header)
      })

      // Once we set up ChainProcessor, if the start is null we want to use
      // genesis head for the ScanState for proper progress tracking
      const scanStart = start ?? (await this.wallet.getChainGenesis())
      const scan = new ScanState(scanStart, end)

      this.state = scan
      unlock()

      this.logger.debug(
        `Scan starting from block ${scan.start.sequence} to ${scan.start.sequence}`,
      )

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
            const head = this.getEarliestHead()
            chainProcessor.hash = head?.hash ?? null
          }

          const result = await chainProcessor.update({ signal: scan.abortController.signal })
          hashChanged = result.hashChanged
        }

        await decryptor.flush()
      })()
        .then(() => {
          this.logger.debug(
            `Finished scanning for transactions after ${Math.floor(
              (Date.now() - scan.startedAt) / 1000,
            )} seconds`,
          )
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

    const connectOnlyAccounts = new Array<Account>()
    const decryptAndConnectAccounts = new Array<Account>()

    for (const candidate of this.scanningAccounts) {
      if (
        !candidate.scanFrom ||
        BufferUtils.equalsNullable(candidate.scanFrom.hash, blockHeader.previousBlockHash)
      ) {
        candidate.scanFrom = null

        if (
          candidate.account.createdAt === null ||
          blockHeader.sequence >= candidate.account.createdAt.sequence
        ) {
          decryptAndConnectAccounts.push(candidate.account)
        } else {
          connectOnlyAccounts.push(candidate.account)
        }
      }
    }

    for (const account of connectOnlyAccounts) {
      if (abort?.signal.aborted) {
        return
      }
      await this.wallet.connectBlockForAccount(account, blockHeader, [], false)
    }

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
      BufferUtils.equalsNullable(head?.hash, header.hash),
    )

    for (const { account } of accounts) {
      if (abort?.signal.aborted) {
        return
      }
      await this.wallet.disconnectBlockForAccount(account, header, transactions)
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
      this.wallet
        .listAccounts()
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
        this.wallet
          .listAccounts()
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
      ({ account, head }) => ({ account, scanFrom: head }),
    )
  }

  private getEarliestHead(): HeadValue | null {
    let earliestHead = null
    for (const { scanFrom: head } of this.scanningAccounts) {
      if (!head) {
        return null
      }
      if (!earliestHead || earliestHead.sequence > head.sequence) {
        earliestHead = head
      }
    }
    return earliestHead
  }
}
