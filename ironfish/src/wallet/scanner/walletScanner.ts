/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { Wallet } from '../wallet'
import { BufferMap } from 'buffer-map'
import { Config } from '../../fileStores'
import { Logger } from '../../logger'
import { Mutex } from '../../mutex'
import { RpcClient } from '../../rpc'
import { AsyncUtils, BufferUtils, HashUtils } from '../../utils'
import { DecryptedNote } from '../../workerPool/tasks/decryptNotes'
import { HeadValue } from '../walletdb/headValue'
import {
  RemoteChainProcessor,
  WalletBlockHeader,
  WalletBlockTransaction,
} from './remoteChainProcessor'
import { ScanState } from './scanState'

export class WalletScanner {
  readonly logger: Logger
  readonly nodeClient: RpcClient | null
  readonly wallet: Wallet

  maxQueueSize: number
  state: ScanState | null = null
  lock: Mutex = new Mutex()

  constructor(options: {
    logger: Logger
    nodeClient: RpcClient | null
    wallet: Wallet
    maxQueueSize: number
    config: Config
  }) {
    this.logger = options.logger
    this.nodeClient = options.nodeClient
    this.wallet = options.wallet
    this.maxQueueSize = options.maxQueueSize
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

  async scan({
    start,
    end,
    force,
  }: {
    start?: HeadValue | null
    end?: HeadValue | null
    force?: boolean
  } = {}): Promise<ScanState | null> {
    if (this.wallet.listAccounts().length === 0) {
      return null
    }

    if (this.running && !force) {
      this.logger.debug('Skipping Scan, already scanning.')
      return null
    }

    if (this.running && force) {
      this.logger.debug('Aborting scan in progress and starting new scan.')
      await this.abort()
    }

    await this.state?.wait()
    const unlock = await this.lock.lock()

    try {
      if (!start) {
        start = await this.wallet.getEarliestHead()
      }

      if (!end) {
        end = await this.wallet.getChainHead()
      }

      const chainProcessor = new RemoteChainProcessor({
        logger: this.logger,
        nodeClient: this.nodeClient,
        maxQueueSize: this.maxQueueSize,
        head: start?.hash ?? null,
      })

      chainProcessor.onAdd.on(async ({ header, transactions }) => {
        await this.connectBlock(header, transactions, this.state?.abortController)
        this.state?.signal(header)
      })

      chainProcessor.onRemove.on(async ({ header, transactions }) => {
        await this.disconnectBlock(header, transactions, this.state?.abortController)
        this.state?.signal(header)
      })

      if (start === null) {
        start = await this.wallet.getChainGenesis()
      }

      this.logger.info(`Scan starting from block ${start.sequence} to ${end.sequence}`)

      const scan = new ScanState(start, end)
      this.state = scan

      void (async () => {
        let hashChanged = true
        while (hashChanged) {
          const result = await chainProcessor.update({ signal: scan.abortController.signal })
          hashChanged = result.hashChanged
        }
      })()
        .then(() => {
          this.logger.info(
            `Finished scanning for transactions after ${Math.floor(
              (Date.now() - scan.startedAt) / 1000,
            )} seconds`,
          )
        })
        .finally(() => {
          this.state?.signalComplete()
          this.state = null
          unlock()
        })

      return scan
    } catch (e) {
      unlock()
      throw e
    }
  }

  async connectBlock(
    blockHeader: WalletBlockHeader,
    transactions: WalletBlockTransaction[],
    abort?: AbortController,
  ): Promise<void> {
    if (blockHeader.sequence % 100 === 0) {
      this.logger.info(
        'Added block' +
          ` seq: ${blockHeader.sequence},` +
          ` hash: ${HashUtils.renderHash(blockHeader.hash)}`,
      )
    }

    const accounts = await AsyncUtils.filter(this.wallet.listAccounts(), async (account) => {
      if (!account.scanningEnabled) {
        return false
      }

      const accountHead = await account.getHead()

      if (!accountHead) {
        return blockHeader.sequence === 1
      } else {
        return BufferUtils.equalsNullable(accountHead.hash, blockHeader.previousBlockHash)
      }
    })

    const shouldDecryptAccounts = await AsyncUtils.filter(accounts, (a) =>
      this.wallet.shouldDecryptForAccount(blockHeader, a),
    )

    const shouldDecryptAccountIds = new Set(shouldDecryptAccounts.map((a) => a.id))

    const decryptedTransactions = await Promise.all(
      transactions.map(({ transaction, initialNoteIndex }) =>
        this.wallet
          .decryptNotes(transaction, initialNoteIndex, false, shouldDecryptAccounts)
          .then((r) => ({
            result: r,
            transaction,
          })),
      ),
    )

    // account id -> transaction hash -> Array<DecryptedNote>
    const decryptedNotesMap: Map<string, BufferMap<Array<DecryptedNote>>> = new Map()
    for (const { transaction, result } of decryptedTransactions) {
      for (const [accountId, decryptedNotes] of result) {
        const accountTxnsMap =
          decryptedNotesMap.get(accountId) ?? new BufferMap<Array<DecryptedNote>>()
        accountTxnsMap.set(transaction.hash(), decryptedNotes)
        decryptedNotesMap.set(accountId, accountTxnsMap)
      }
    }

    for (const account of accounts) {
      if (abort?.signal.aborted) {
        return
      }

      const accountTxnsMap = decryptedNotesMap.get(account.id)
      const txns = transactions.map((t) => ({
        transaction: t.transaction,
        decryptedNotes: accountTxnsMap?.get(t.transaction.hash()) ?? [],
      }))

      await this.wallet.connectBlockForAccount(
        account,
        blockHeader,
        txns,
        shouldDecryptAccountIds.has(account.id),
      )
    }
  }

  async disconnectBlock(
    header: WalletBlockHeader,
    transactions: WalletBlockTransaction[],
    abort?: AbortController,
  ): Promise<void> {
    this.logger.debug(`AccountHead DEL: ${header.sequence} => ${Number(header.sequence) - 1}`)

    const accounts = await AsyncUtils.filter(this.wallet.listAccounts(), async (account) => {
      if (!account.scanningEnabled) {
        return false
      }

      const accountHead = await account.getHead()

      return BufferUtils.equalsNullable(accountHead?.hash ?? null, header.hash)
    })

    for (const account of accounts) {
      if (abort?.signal.aborted) {
        return
      }

      await this.wallet.disconnectBlockForAccount(account, header, transactions)
    }
  }
}
