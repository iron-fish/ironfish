/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert, BenchUtils, IronfishSdk } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { LocalFlags } from '../../flags'
import { IronfishCliPKG } from '../../package'

export default class BenchmarkChain extends IronfishCommand {
  static description = 'Rebuild the main chain to fix corruption'

  static flags = {
    ...LocalFlags,
    confirm: Flags.boolean({
      char: 'c',
      default: false,
      description: 'force confirmation to repair',
    }),
    force: Flags.boolean({
      char: 'f',
      default: false,
      description: 'force merkle tree reconstruction',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(BenchmarkChain)

    CliUx.ux.action.start(`Opening node`)
    const node = await this.sdk.node()
    await node.openDB()
    await node.chain.open()
    CliUx.ux.action.stop('done.')

    CliUx.ux.action.start(`Opening benchmark node`)
    const benchmarkSdk = await IronfishSdk.init({
      pkg: IronfishCliPKG,
      dataDir: '~/.ironfishbenchmark',
      logger: this.logger,
    })
    const benchmarkNode = await benchmarkSdk.node()
    await benchmarkNode.openDB()
    await benchmarkNode.chain.open()
    CliUx.ux.action.start(`done.`)

    if (node.chain.isEmpty) {
      this.log(`Chain is too corrupt. Delete your DB at ${node.config.chainDatabasePath}`)
      this.exit(0)
    }

    const blocksToBenchmark = 100

    if (node.chain.head.sequence < blocksToBenchmark) {
      this.log(`Need to sync more blocks for testing.`)
      this.exit(0)
    }

    const finalHeader = await node.chain.getHeaderAtSequence(blocksToBenchmark)
    Assert.isNotNull(finalHeader)

    let totalTime = 0

    for await (const header of node.chain.iterateTo(node.chain.genesis, finalHeader)) {
      const block = await node.chain.getBlock(header)
      Assert.isNotNull(block)

      const start = BenchUtils.start()
      await benchmarkNode.chain.addBlock(block)
      totalTime += BenchUtils.end(start)
    }

    const start = BenchUtils.start()
    await benchmarkNode.chain.notes.rehashTree()
    totalTime += BenchUtils.end(start)

    const benchRootHash = await benchmarkNode.chain.notes.rootHash()
    const realRootHash = await node.chain.notes.pastRoot(finalHeader.noteCommitment.size)
    this.log(`bnch hash: ${benchRootHash.toString('hex')}`)
    this.log(`real hash: ${realRootHash.toString('hex')}`)

    this.log(`Benchmark complete in ${totalTime} ms.`)
  }
}
