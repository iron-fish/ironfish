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
  JsonEncoding,
  NumberEncoding,
  StringEncoding,
} from '../storage'
import { createDB } from '../storage/utils'
import { SetTimeoutToken } from '../utils'
import { BlockchainUtils, isBlockMine } from '../utils/blockchain'

const DATABASE_VERSION = 1

const getMinedBlocksDBMetaDefaults = (): MinedBlocksDBMeta => ({
  accountToRemove: null,
  headHash: null,
})

type MinedBlocksDBMeta = {
  accountToRemove: string | null
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

  protected files: FileSystem
  protected database: IDatabase
  protected location: string
  protected readonly accounts: Accounts
  protected readonly logger: Logger
  protected isOpen: boolean
  protected isStarted: boolean
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
      keyEncoding: new NumberEncoding(),
      valueEncoding: new JsonEncoding<Buffer[]>(),
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
      this.chainProcessor.hash = null
    })

    this.accounts.onAccountRemoved.on(async (account) => {
      await this.meta.put('accountToRemove', account.name)
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

    const accountName = await this.meta.get('accountToRemove')
    if (accountName) {
      await this.removeMinedBlocks(accountName)
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
    const iterator = this.minedBlocks.getAllIter()
    for await (const [hash, block] of iterator) {
      if (block.account === accountName) {
        await this.database.transaction(async (tx) => {
          await this.sequenceToHashes.del(block.sequence, tx)
          await this.minedBlocks.del(hash, tx)
        })
      }
    }

    await this.meta.put('accountToRemove', null)
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
    { main: boolean; sequence: number; account: string; minersFee: number; hash: Buffer },
    void,
    unknown
  > {
    // eslint-disable-next-line prettier/prettier
    ({ start, stop } = BlockchainUtils.getBlockRange(this.chain, { start, stop }))

    for (let sequence = start; sequence <= stop; ++sequence) {
      const hashes = await this.sequenceToHashes.get(sequence)

      if (!hashes) {
        continue
      }

      const blocks = await Promise.all(
        hashes.map(async (h) => {
          const minedBlock = await this.minedBlocks.get(h)
          if (minedBlock !== undefined) {
            return { hash: h, ...minedBlock }
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
