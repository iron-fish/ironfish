/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  DatabaseIsLockedError,
  DatabaseOpenError,
  ErrorUtils,
  FileUtils,
  FullNode,
  IronfishPKG,
} from '@ironfish/sdk'
import { execSync } from 'child_process'
import os from 'os'
import { getHeapStatistics } from 'v8'
import { IronfishCommand } from '../command'
import { JsonFlags } from '../flags'
import * as ui from '../ui'

export default class Debug extends IronfishCommand {
  static description = 'Show debug information to help locate issues'
  static hidden = true
  static enableJsonFlag = true

  static flags = {
    ...JsonFlags,
  }

  async start(): Promise<unknown> {
    const node = await this.sdk.node({ autoSeed: false })

    let dbOpen = true
    try {
      await node.openDB()
    } catch (err) {
      if (err instanceof DatabaseIsLockedError) {
        this.log('Database in use, skipping output that requires database.')
        this.log('Stop the node and run the debug command again to show full output.\n')
        dbOpen = false
      } else if (err instanceof DatabaseOpenError) {
        this.log('Database cannot be opened, skipping output that requires database.\n')
        this.log(ErrorUtils.renderError(err, true) + '\n')
        dbOpen = false
      }
    }

    let output = this.baseOutput(node)
    if (dbOpen) {
      output = { ...output, ...(await this.outputRequiringDB(node)) }
    }

    this.log(ui.card(output))

    return output
  }

  baseOutput(node: FullNode): Record<string, string> {
    const cpus = os.cpus()
    const cpuNames = [...new Set(cpus.map((c) => c.model))]
    const cpuThreads = cpus.length

    const memTotal = FileUtils.formatMemorySize(os.totalmem())
    const heapTotal = FileUtils.formatMemorySize(getHeapStatistics().total_available_size)

    const telemetryEnabled = this.sdk.config.get('enableTelemetry').toString()
    const assetVerificationEnabled = this.sdk.config.get('enableAssetVerification').toString()

    const nodeName = this.sdk.config.get('nodeName').toString()
    const blockGraffiti = this.sdk.config.get('blockGraffiti').toString()

    let cmdInPath: boolean
    try {
      execSync('ironfish --help', { stdio: 'ignore' })
      cmdInPath = true
    } catch {
      cmdInPath = false
    }

    return {
      'Iron Fish version': `${node.pkg.version} @ ${node.pkg.git}`,
      'Iron Fish library': `${IronfishPKG.version} @ ${IronfishPKG.git}`,
      'Operating system': `${os.type()} ${process.arch}`,
      'CPU model(s)': cpuNames.toString(),
      'CPU threads': cpuThreads.toString(),
      'RAM total': memTotal,
      'Heap total': heapTotal,
      'Node version': process.version,
      'ironfish in PATH': cmdInPath.toString(),
      'Garbage Collector Exposed': String(!!global.gc),
      'Telemetry enabled': telemetryEnabled,
      'Asset Verification enabled': assetVerificationEnabled,
      'Node name': nodeName,
      'Block graffiti': blockGraffiti,
    }
  }

  async outputRequiringDB(node: FullNode): Promise<Record<string, string>> {
    const output: Record<string, string> = {}

    const headHashes = new Map<string, Buffer | null>()
    for await (const { accountId, head } of node.wallet.walletDb.loadHeads()) {
      headHashes.set(accountId, head?.hash ?? null)
    }

    for (const [accountId, headHash] of headHashes.entries()) {
      const account = node.wallet.getAccount(accountId)

      const blockHeader = headHash ? await node.chain.getHeader(headHash) : null
      const headInChain = !!blockHeader
      const headSequence = blockHeader?.sequence || 'null'

      const shortId = accountId.slice(0, 6)

      output[`Account ${shortId} uuid`] = accountId
      output[`Account ${shortId} name`] = account?.name || `ACCOUNT NOT FOUND`
      output[`Account ${shortId} head hash`] = headHash ? headHash.toString('hex') : 'NULL'
      output[`Account ${shortId} head in chain`] = headInChain.toString()
      output[`Account ${shortId} sequence`] = headSequence ? headSequence.toString() : 'NULL'
    }

    return output
  }
}
