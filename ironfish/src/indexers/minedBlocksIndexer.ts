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
  ArrayEncoding,
  BufferEncoding,
  IDatabase,
  IDatabaseStore,
  IDatabaseTransaction,
  JsonEncoding,
  StringEncoding,
  U32Encoding,
} from '../storage'
import { createDB } from '../storage/utils'
import { SetTimeoutToken } from '../utils'
import { BlockchainUtils, isBlockMine } from '../utils/blockchain'

const DATABASE_VERSION = 1
const REMOVAL_KEY = 'accountsToRemove'

const getMinedBlocksDBMetaDefaults = (): MinedBlocksDBMeta => ({
  headHash: null,
})

type MinedBlocksDBMeta = {
  headHash: string | null
}

type MinedBlock = {
  main: boolean
  sequence: number
  account: string
  minersFee: number
}

export class MinedBlocksIndexer {
  protected meta: IDatabaseStore<{
    key: keyof MinedBlocksDBMeta
    value: MinedBlocksDBMeta[keyof MinedBlocksDBMeta]
  }>
  protected minedBlocks: IDatabaseStore<{ key: Buffer; value: MinedBlock }>
  protected sequenceToHashes: IDatabaseStore<{ key: number; value: Buffer[] }>
  protected accountsToRemove: IDatabaseStore<{ key: string; value: string[] }>

  protected files: FileSystem
  protected database: IDatabase
  protected location: string
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
      valueEncoding: new JsonEncoding(),
    })

    this.minedBlocks = this.database.addStore<{ key: Buffer; value: MinedBlock }>({
      name: 'blocks',
      keyEncoding: new BufferEncoding(),
      valueEncoding: new JsonEncoding<MinedBlock>(),
    })

    this.sequenceToHashes = this.database.addStore<{ key: number; value: Buffer[] }>({
      name: 'seqToHash',
      keyEncoding: new U32Encoding(),
      valueEncoding: new JsonEncoding<Buffer[]>(),
    })

    this.accountsToRemove = this.database.addStore<{ key: string; value: string[] }>({
      name: 'accsToRemove',
      keyEncoding: new StringEncoding(),
      valueEncoding: new ArrayEncoding<string[]>(),
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

          const sequences = (await this.sequenceToHashes.get(header.sequence, tx)) ?? []
          sequences.push(header.hash)
          await this.sequenceToHashes.put(header.sequence, sequences, tx)

          await this.updateHeadHash(header.hash, tx)
        })
      }
    })

    this.chainProcessor.onRemove.on(async (header) => {
      await this.database.transaction(async (tx) => {
        if (await this.minedBlocks.has(header.hash, tx)) {
          const block = await this.chain.getBlock(header)
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
      const accounts: string[] = (await this.accountsToRemove.get(REMOVAL_KEY)) ?? []
      accounts.push(account.name)
      await this.accountsToRemove.put(REMOVAL_KEY, accounts)
    })
  }

  async open(
    options: { upgrade?: boolean; load?: boolean } = { upgrade: true, load: true },
  ): Promise<void> {
    if (this.isOpen) {
      return
    }

    this.isOpen = true
    await this.openDB(options)

    if (options.load) {
      await this.load()
    }
  }

  async close(): Promise<void> {
    if (!this.isOpen) {
      return
    }

    this.isOpen = false
    await this.closeDB()
  }

  async openDB(options: { upgrade?: boolean } = { upgrade: true }): Promise<void> {
    await this.files.mkdir(this.location, { recursive: true })
    await this.database.open()

    if (options.upgrade) {
      await this.database.upgrade(DATABASE_VERSION)
    }
  }

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

  start(): void {
    if (this.isStarted) {
      return
    }
    this.isStarted = true

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

    const accountNames = await this.accountsToRemove.get(REMOVAL_KEY)
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
          let hashes = await this.sequenceToHashes.get(block.sequence)
          Assert.isNotUndefined(hashes)
          hashes = hashes.filter((h) => !h.equals(hash))
          await this.sequenceToHashes.put(block.sequence, hashes, tx)
          await this.minedBlocks.del(hash, tx)
        })
      }
    }

    const accountsToRemove = await this.accountsToRemove.get(REMOVAL_KEY)
    if (accountsToRemove) {
      accountsToRemove.filter((name) => name !== accountName)
      await this.accountsToRemove.put(REMOVAL_KEY, accountsToRemove)
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

    const accountsToRemove = new Set(await this.accountsToRemove.get(REMOVAL_KEY)) ?? []

    for (let sequence = start; sequence <= stop; ++sequence) {
      const hashes = await this.sequenceToHashes.get(sequence)

      if (!hashes) {
        continue
      }

      const blocks = await Promise.all(
        hashes.map(async (h) => {
          const minedBlock = await this.minedBlocks.get(h)
          if (minedBlock && !accountsToRemove.has(minedBlock.account)) {
            return { hash: h.toString('hex'), ...minedBlock }
          }
        }),
      )

      for (const block of blocks) {
        Assert.isNotUndefined(block)

        if (!scanForks && !block.main) {
          continue
        }

        yield block
      }
    }
  }
}
