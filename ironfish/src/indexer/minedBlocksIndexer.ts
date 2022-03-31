/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Accounts } from '../account'
import { Assert } from '../assert'
import { Blockchain } from '../blockchain'
import { ChainProcessor } from '../chainProcessor'
import { FileSystem } from '../fileSystems'
import { createRootLogger, Logger } from '../logger'
import { IDatabase, IDatabaseStore, JsonEncoding, StringEncoding } from '../storage'
import { createDB } from '../storage/utils'
import { SetTimeoutToken } from '../utils'
import { isBlockMine } from '../utils/blockchain'

const DATABASE_VERSION = 1

type MinedBlocksDBMeta = {
  headHash: string | null
}

type MinedBlock = {
  main: boolean
  hash: string
  sequence: number
  account: string
  minersFee: number
}

export class MinedBlocksIndexer {
  protected meta: IDatabaseStore<{
    key: keyof MinedBlocksDBMeta
    value: MinedBlocksDBMeta[keyof MinedBlocksDBMeta]
  }>
  protected minedBlocks: IDatabaseStore<{ key: string; value: MinedBlock }>
  protected accountToBlockHashes: IDatabaseStore<{ key: string; value: string[] }>

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
      name: 'minedBlocksDBMeta',
      keyEncoding: new StringEncoding<keyof MinedBlocksDBMeta>(),
      valueEncoding: new JsonEncoding(),
    })

    this.minedBlocks = this.database.addStore<{ key: string; value: MinedBlock }>({
      name: 'minedBlocks',
      keyEncoding: new StringEncoding(),
      valueEncoding: new JsonEncoding(),
    })

    this.accountToBlockHashes = this.database.addStore<{ key: string; value: string[] }>({
      name: 'accountToBlockHashes',
      keyEncoding: new StringEncoding(),
      valueEncoding: new JsonEncoding(),
    })

    this.chainProcessor = new ChainProcessor({ logger, chain, head: null })

    this.chainProcessor.onAdd.on(async (header) => {
      const block = await this.chain.getBlock(header)
      Assert.isNotNull(block)

      const account = this.accounts.listAccounts().find((a) => isBlockMine(block, a))
      await this.database.transaction(async (tx) => {
        if (account) {
          await this.minedBlocks.put(
            header.hash.toString('hex'),
            {
              main: true,
              hash: header.hash.toString('hex'),
              sequence: header.sequence,
              account: account.name,
              minersFee: Number(header.minersFee),
            },
            tx,
          )
          const hashes: string[] = (await this.accountToBlockHashes.get(account.name, tx)) || []
          hashes.concat(block.header.hash.toString('hex'))
          await this.accountToBlockHashes.put(account.name, hashes, tx)
        }
      })

      await this.updateHeadHash(header.hash)
    })

    this.chainProcessor.onRemove.on(async (header) => {
      if (await this.minedBlocks.has(header.hash.toString('hex'))) {
        const block = await this.chain.getBlock(header)
        Assert.isNotNull(block)

        const account = this.accounts.listAccounts().find((a) => isBlockMine(block, a))
        if (account) {
          const minedBlock = await this.minedBlocks.get(header.hash.toString('hex'))
          if (minedBlock) {
            minedBlock.main = false
            await this.minedBlocks.put(header.hash.toString('hex'), minedBlock)
          }
        }
      }

      await this.updateHeadHash(header.previousBlockHash)
    })

    this.accounts.onAccountCreated.on((_account, imported) => {
      if (imported) {
        this.chainProcessor.hash = null
      }
    })

    this.accounts.onAccountRemoved.on(async (accountName) => {
      await this.database.transaction(async (tx) => {
        const hashes = await this.accountToBlockHashes.get(accountName, tx)
        if (hashes) {
          for (const hash of hashes) {
            await this.minedBlocks.del(hash, tx)
          }
        }
      })
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
    const headHash = await this.meta.get('headHash')
    this.chainProcessor.hash = headHash ? Buffer.from(headHash, 'hex') : null
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

  async updateHeadHash(headHash: Buffer | null): Promise<void> {
    const hashString = headHash && headHash.toString('hex')
    await this.meta.put('headHash', hashString)
  }

  async getMinedBlocks(includeForks?: boolean): Promise<
    {
      main: boolean
      hash: string
      sequence: number
      account: string
      minersFee: number
    }[]
  > {
    const minedBlocks = (await this.minedBlocks.getAllValues()).sort(
      (a, b) => a.sequence - b.sequence,
    )

    if (includeForks) {
      return minedBlocks
    }

    return minedBlocks.filter((block) => block.main === true)
  }
}
