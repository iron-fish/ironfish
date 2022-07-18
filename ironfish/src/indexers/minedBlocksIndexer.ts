/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Accounts } from '../account'
import { Assert } from '../assert'
import { Blockchain } from '../blockchain'
import { ChainProcessor } from '../chainProcessor'
import { FileSystem } from '../fileSystems'
import { createRootLogger, Logger } from '../logger'
import {
  BufferEncoding,
  IDatabase,
  IDatabaseStore,
  IDatabaseTransaction,
  StringEncoding,
  U32Encoding,
} from '../storage'
import { createDB } from '../storage/utils'
import { SetTimeoutToken } from '../utils'
import { BlockchainUtils, isBlockMine } from '../utils/blockchain'
import {
  AccountsToRemoveValue,
  AccountsToRemoveValueEncoding,
} from './database/accountsToRemove'
import { MetaValue, MetaValueEncoding, MinedBlocksDBMeta } from './database/meta'
import { MinedBlockValue, MinedBlockValueEncoding } from './database/minedBlock'
import {
  SequenceToHashesValue,
  SequenceToHashesValueEncoding,
} from './database/sequenceToHashes'

const DATABASE_VERSION = 12
const REMOVAL_KEY = 'accountsToRemove'

const getMinedBlocksDBMetaDefaults = (): MinedBlocksDBMeta => ({
  headHash: null,
})

export class MinedBlocksIndexer {
  protected meta: IDatabaseStore<{
    key: keyof MinedBlocksDBMeta
    value: MetaValue
  }>
  protected minedBlocks: IDatabaseStore<{ key: Buffer; value: MinedBlockValue }>
  protected sequenceToHashes: IDatabaseStore<{ key: number; value: SequenceToHashesValue }>
  protected accountsToRemove: IDatabaseStore<{ key: string; value: AccountsToRemoveValue }>

  protected files: FileSystem
  readonly database: IDatabase
  readonly location: string
  protected readonly accounts: Accounts
  protected readonly logger: Logger
  protected isOpen: boolean
  protected isStarted: boolean
  protected rescan: boolean
  protected eventLoopTimeout: SetTimeoutToken | null = null
  protected chain: Blockchain
  protected chainProcessor: ChainProcessor

  constructor({
    files,
    location,
    accounts,
    chain,
    logger = createRootLogger(),
  }: {
    files: FileSystem
    location: string
    accounts: Accounts
    chain: Blockchain
    logger?: Logger
  }) {
    this.files = files
    this.location = location
    this.database = createDB({ location })
    this.accounts = accounts
    this.logger = logger
    this.chain = chain
    this.isOpen = false
    this.isStarted = false
    this.rescan = false

    this.meta = this.database.addStore<{
      key: keyof MinedBlocksDBMeta
      value: MinedBlocksDBMeta[keyof MinedBlocksDBMeta]
    }>({
      name: 'meta',
      keyEncoding: new StringEncoding<keyof MinedBlocksDBMeta>(),
      valueEncoding: new MetaValueEncoding(),
    })

    this.minedBlocks = this.database.addStore<{ key: Buffer; value: MinedBlockValue }>({
      name: 'blocks',
      keyEncoding: new BufferEncoding(),
      valueEncoding: new MinedBlockValueEncoding(),
    })

    this.sequenceToHashes = this.database.addStore<{
      key: number
      value: SequenceToHashesValue
    }>({
      name: 'seqToHash',
      keyEncoding: new U32Encoding(),
      valueEncoding: new SequenceToHashesValueEncoding(),
    })

    this.accountsToRemove = this.database.addStore<{
      key: string
      value: AccountsToRemoveValue
    }>({
      name: 'accsToRemove',
      keyEncoding: new StringEncoding(),
      valueEncoding: new AccountsToRemoveValueEncoding(),
    })

    this.chainProcessor = new ChainProcessor({ logger, chain, head: null })

    this.chainProcessor.onAdd.on(async (header) => {
      const block = await this.chain.getBlock(header)
      Assert.isNotNull(block)

      const account = this.accounts.listAccounts().find((a) => isBlockMine(block, a))
      if (account) {
        await this.database.transaction(async (tx) => {
          await this.minedBlocks.put(
            header.hash,
            {
              main: true,
              sequence: header.sequence,
              account: account.name,
              minersFee: Number(header.minersFee),
            },
            tx,
          )

          const hashes = await this.getHashesAtSequence(header.sequence, tx)
          hashes.push(header.hash)
          await this.sequenceToHashes.put(header.sequence, { hashes }, tx)

          await this.updateHeadHash(header.hash, tx)
        })
      }
    })

    this.chainProcessor.onRemove.on(async (header) => {
      await this.database.transaction(async (tx) => {
        if (await this.minedBlocks.has(header.hash, tx)) {
          const block = await this.chain.getBlock(header, tx)
          Assert.isNotNull(block)

          const account = this.accounts.listAccounts().find((a) => isBlockMine(block, a))
          if (account) {
            const minedBlock = await this.minedBlocks.get(header.hash, tx)
            if (minedBlock) {
              minedBlock.main = false
              await this.minedBlocks.put(header.hash, minedBlock, tx)
            }
          }
        }

        await this.updateHeadHash(header.previousBlockHash, tx)
      })
    })

    this.accounts.onAccountImported.on(() => {
      this.rescan = true
    })

    this.accounts.onAccountRemoved.on(async (account) => {
      const accounts = await this.getAccountsToBeRemoved()
      accounts.push(account.name)
      await this.accountsToRemove.put(REMOVAL_KEY, { accounts })
    })
  }

  async open(): Promise<void> {
    if (this.isOpen) {
      return
    }

    this.isOpen = true

    await this.files.mkdir(this.location, { recursive: true })
    await this.database.open()
    await this.database.upgrade(DATABASE_VERSION)
    await this.load()
  }

  async close(): Promise<void> {
    if (!this.isOpen) {
      return
    }

    this.isOpen = false
    await this.closeDB()
  }

  async openDB(options: { upgrade?: boolean } = { upgrade: true }): Promise<void> {}

  async closeDB(): Promise<void> {
    await this.database.close()
  }

  async load(): Promise<void> {
    const meta = await this.loadMinedBlocksMeta()
    this.chainProcessor.hash = meta.headHash ? Buffer.from(meta.headHash, 'hex') : null
  }

  async loadMinedBlocksMeta(): Promise<MinedBlocksDBMeta> {
    const meta = { ...getMinedBlocksDBMetaDefaults() }

    for await (const [key, value] of this.meta.getAllIter()) {
      meta[key] = value
    }

    return meta
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
          `Resetting mined blocks index database because index head was not found in chain: ${this.chainProcessor.hash.toString(
            'hex',
          )}`,
        )

        await this.reset()
      }
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

    if (this.database.isOpen) {
      await this.updateHeadHash(this.chainProcessor.hash)
    }
  }

  async eventLoop(): Promise<void> {
    if (!this.isStarted) {
      return
    }

    const accountNames = await this.getAccountsToBeRemoved()
    if (accountNames) {
      for (const accountName of accountNames) {
        await this.removeMinedBlocks(accountName)
      }
    }

    if (this.rescan) {
      this.chainProcessor.hash = null
      this.rescan = false
    }

    await this.updateHead()

    if (this.isStarted) {
      this.eventLoopTimeout = setTimeout(() => void this.eventLoop(), 1000)
    }
  }

  async updateHead(): Promise<void> {
    const { hashChanged } = await this.chainProcessor.update()

    if (hashChanged) {
      this.logger.debug(
        `Updated MinedBlocksIndexer Head: ${String(this.chainProcessor.hash?.toString('hex'))}`,
      )
    }
  }

  async reset(): Promise<void> {
    this.chainProcessor.hash = null
    await this.updateHeadHash(null)
  }

  async getHashesAtSequence(sequence: number, tx?: IDatabaseTransaction): Promise<Buffer[]> {
    const hashes = await this.sequenceToHashes.get(sequence, tx)

    if (!hashes) {
      return []
    }

    return hashes.hashes
  }

  async getAccountsToBeRemoved(): Promise<string[]> {
    const accounts = await this.accountsToRemove.get(REMOVAL_KEY)

    if (!accounts) {
      return []
    }

    return accounts.accounts
  }

  async updateHeadHash(headHash: Buffer | null, tx?: IDatabaseTransaction): Promise<void> {
    const hashString = headHash && headHash.toString('hex')
    await this.meta.put('headHash', hashString, tx)
  }

  async removeMinedBlocks(accountName: string): Promise<void> {
    this.logger.debug(`Removing mined blocks for account ${accountName}`)

    const iterator = this.minedBlocks.getAllIter()
    for await (const [hash, block] of iterator) {
      if (block.account === accountName) {
        await this.database.transaction(async (tx) => {
          let hashes = await this.getHashesAtSequence(block.sequence, tx)
          hashes = hashes.filter((h) => !h.equals(hash))
          await this.sequenceToHashes.put(block.sequence, { hashes }, tx)
          await this.minedBlocks.del(hash, tx)
        })
      }
    }

    let accountsToRemove = await this.getAccountsToBeRemoved()
    if (accountsToRemove) {
      accountsToRemove = accountsToRemove.filter((name) => name !== accountName)
      await this.accountsToRemove.put(REMOVAL_KEY, { accounts: accountsToRemove })
    }

    this.logger.debug(`Finished removing mined blocks for account ${accountName}`)
  }

  async getMinedBlock(
    blockHash: Buffer,
  ): Promise<
    | { main: boolean; sequence: number; account: string; minersFee: number; hash: string }
    | undefined
  > {
    const minedBlock = await this.minedBlocks.get(blockHash)

    return minedBlock ? { hash: blockHash.toString('hex'), ...minedBlock } : undefined
  }

  async *getMinedBlocks({
    scanForks,
    start,
    stop,
  }: {
    scanForks?: boolean
    start?: number
    stop?: number
  }): AsyncGenerator<
    { main: boolean; sequence: number; account: string; minersFee: number; hash: string },
    void,
    unknown
  > {
    // eslint-disable-next-line prettier/prettier
    ({ start, stop } = BlockchainUtils.getBlockRange(this.chain, { start, stop }))

    const accountsToRemove = new Set(await this.getAccountsToBeRemoved()) ?? []

    for (let sequence = start; sequence <= stop; ++sequence) {
      const hashes = await this.getHashesAtSequence(sequence)

      if (!hashes) {
        continue
      }

      for (const hash of hashes) {
        const minedBlock = await this.minedBlocks.get(hash)
        if (minedBlock && !accountsToRemove.has(minedBlock.account)) {
          if (!scanForks && !minedBlock.main) {
            continue
          }

          yield { hash: hash.toString('hex'), ...minedBlock }
        }
      }
    }
  }
}
