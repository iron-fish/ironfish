/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { FileUtils, NodeUtils, Package } from 'ironfish'
import os from 'os'
import { IronfishCommand } from '../command'
import { LocalFlags } from '../flags'

export default class Debug extends IronfishCommand {
  static description = 'Show debug information to help locate issues'
  static hidden = true

  static flags = {
    ...LocalFlags,
  }

  async start(): Promise<void> {
    const node = await this.sdk.node({ autoSeed: false })
    await NodeUtils.waitForOpen(node, null, { upgrade: false })

    const accountsMeta = await node.accounts.db.loadAccountsMeta()
    const accountsHeadHash = accountsMeta.headHash !== null ? accountsMeta.headHash : ''

    const accountsBlockHeader = await node.chain.getHeader(Buffer.from(accountsHeadHash, 'hex'))
    const accountsHeadInChain = !!accountsBlockHeader
    const accountsHeadSequence = accountsBlockHeader?.sequence || 'null'

    const cpus = os.cpus()
    const cpuName = cpus[0].model
    const cpuThreads = cpus.length

    const memTotal = FileUtils.formatMemorySize(os.totalmem())

    const telemetryEnabled = this.sdk.config.get('enableTelemetry').toString()

    this.log(`
Ironfish version        ${Package.version} @ ${Package.git}
Operating System        ${os.type()} ${process.arch}
CPU model               ${cpuName}
CPU threads             ${cpuThreads}
RAM total               ${memTotal}
Node version            ${process.version}
Telemetry enabled       ${telemetryEnabled}
Accounts head hash      ${accountsHeadHash}
Accounts head in chain  ${accountsHeadInChain.toString()}
Accounts head sequence  ${accountsHeadSequence}
    `)
  }
}
