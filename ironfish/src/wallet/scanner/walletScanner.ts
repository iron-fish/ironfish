/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { Wallet } from '../wallet'
import { BufferMap } from 'buffer-map'
import { Assert } from '../../assert'
import { Config } from '../../fileStores'
import { Logger } from '../../logger'
import { Mutex } from '../../mutex'
import { BlockHeader, Transaction } from '../../primitives'
import { RpcClient } from '../../rpc'
import { AsyncUtils, BufferUtils, HashUtils } from '../../utils'
import { DecryptedNote } from '../../workerPool/tasks/decryptNotes'
import { RemoteChainProcessor } from './remoteChainProcessor'
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

  async scan(): Promise<ScanState> {
    const unlock = await this.lock.lock()

    if (this.state) {
      return this.state
    }

    try {
      const start = await this.wallet.getEarliestHead()
      const end = await this.wallet.getChainHead()

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

      // Once we set up ChainProcessor, if the start is null we want to use
      // genesis head for the ScanState for proper progress tracking
      const scanStart = start ?? (await this.wallet.getChainGenesis())
      const scan = new ScanState(scanStart, end)

      this.state = scan
      unlock()

      this.logger.debug(
        `Scan starting from block ${scan.start.sequence} to ${scan.start.sequence}`,
      )

      void (async () => {
        let hashChanged = true
        while (hashChanged) {
          const head = await this.wallet.getEarliestHead()
          chainProcessor.hash = head?.hash ?? null

          const result = await chainProcessor.update({ signal: scan.abortController.signal })
          hashChanged = result.hashChanged
        }
      })()
        .then(() => {
          this.logger.debug(
            `Finished scanning for transactions after ${Math.floor(
              (Date.now() - scan.startedAt) / 1000,
            )} seconds`,
          )
        })
        .finally(() => {
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

    const shouldDecryptAccounts = accounts.filter((a) =>
      this.wallet.shouldDecryptForAccount(blockHeader, a),
    )

    const shouldDecryptAccountIds = new Set(shouldDecryptAccounts.map((a) => a.id))

    const decryptedTransactions = await Promise.all(
      getTransactionsWithNoteIndex(blockHeader, transactions).map(
        ({ transaction, initialNoteIndex }) =>
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

      const txns = transactions.map((transaction) => ({
        transaction,
        decryptedNotes: accountTxnsMap?.get(transaction.hash()) ?? [],
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
    header: BlockHeader,
    transactions: Transaction[],
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

function getTransactionsWithNoteIndex(
  header: BlockHeader,
  transactions: Transaction[],
): Array<{ transaction: Transaction; initialNoteIndex: number }> {
  Assert.isNotNull(header.noteSize)
  let initialNoteIndex = header.noteSize

  const result = []

  for (const transaction of transactions.slice().reverse()) {
    initialNoteIndex -= transaction.notes.length
    result.push({ transaction, initialNoteIndex })
  }

  return result.slice().reverse()
}
