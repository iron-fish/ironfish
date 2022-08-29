/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NodeUtils, RpcMemoryClient } from '@ironfish/sdk'
import fs from 'fs/promises'
import repl from 'node:repl'
import path from 'path'
import { IronfishCommand } from '../command'
import {
  ConfigFlag,
  ConfigFlagKey,
  DataDirFlag,
  DataDirFlagKey,
  VerboseFlag,
  VerboseFlagKey,
} from '../flags'

export default class Repl extends IronfishCommand {
  static description = 'An interactive terminal to the node'

  static flags = {
    [VerboseFlagKey]: VerboseFlag,
    [ConfigFlagKey]: ConfigFlag,
    [DataDirFlagKey]: DataDirFlag,
  }

  async start(): Promise<void> {
    await this.parse(Repl)

    const node = await this.sdk.node()
    const client = new RpcMemoryClient(this.logger, node)
    await NodeUtils.waitForOpen(node)

    this.log('Examples:')
    this.log('  Get the head block hash')
    this.log(`  > chain.head.hash.toString('hex')`)
    this.log('\n  Get the head block sequence')
    this.log(`  > chain.head.sequence`)
    this.log('\n  Get a block at a sequence')
    this.log(`  > await chain.getHeaderAtSequence(1)`)
    this.log('\n  List all account names')
    this.log(`  > accounts.listAccounts().map((a) => a.name)`)
    this.log(`\n  Get the balance of an account`)
    this.log(`  > await accounts.getBalance('default')`)
    this.log(`\n  Use the RPC node/getStatus`)
    this.log(`  > (await client.status()).content`)
    this.log('')

    const historyPath = path.join(node.config.tempDir, 'repl_history.txt')
    await fs.mkdir(node.config.tempDir, { recursive: true })
    this.log(`Storing repl history at ${historyPath}`)
    this.log('Type .exit or press CTRL+C to quit')

    const server = repl.start('> ')
    server.context.sdk = this.sdk
    server.context.client = client
    server.context.node = node
    server.context.chain = node.chain
    server.context.accounts = node.accounts
    server.context.memPool = node.memPool

    // Setup command history file
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    server.setupHistory(historyPath, () => {})

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    await new Promise(() => {})
  }
}
