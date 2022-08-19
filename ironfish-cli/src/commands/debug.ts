/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  DatabaseIsLockedError,
  DatabaseOpenError,
  ErrorUtils,
  FileUtils,
  IronfishNode,
  IronfishPKG,
} from '@ironfish/sdk'
import { execSync } from 'child_process'
import os from 'os'
import { getHeapStatistics } from 'v8'
import { IronfishCommand } from '../command'
import { LocalFlags } from '../flags'

const SPACE_BUFFER = 8

export default class Debug extends IronfishCommand {
  static description = 'Show debug information to help locate issues'
  static hidden = true

  static flags = {
    ...LocalFlags,
  }

  async start(): Promise<void> {
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
      output = new Map([...output, ...(await this.outputRequiringDB(node))])
    }

    this.display(output)
  }

  baseOutput(node: IronfishNode): Map<string, string> {
    const cpus = os.cpus()
    const cpuNames = [...new Set(cpus.map((c) => c.model))]
    const cpuThreads = cpus.length

    const memTotal = FileUtils.formatMemorySize(os.totalmem())
    const heapTotal = FileUtils.formatMemorySize(getHeapStatistics().total_available_size)

    const telemetryEnabled = this.sdk.config.get('enableTelemetry').toString()

    const nodeName = this.sdk.config.get('nodeName').toString()
    const blockGraffiti = this.sdk.config.get('blockGraffiti').toString()

    let cmdInPath: boolean
    try {
      execSync('ironfish --help', { stdio: 'ignore' })
      cmdInPath = true
    } catch {
      cmdInPath = false
    }

    return new Map<string, string>([
      ['Iron Fish version', `${node.pkg.version} @ ${node.pkg.git}`],
      ['Iron Fish library', `${IronfishPKG.version} @ ${IronfishPKG.git}`],
      ['Operating system', `${os.type()} ${process.arch}`],
      ['CPU model(s)', `${cpuNames.toString()}`],
      ['CPU threads', `${cpuThreads}`],
      ['RAM total', `${memTotal}`],
      ['Heap total', `${heapTotal}`],
      ['Node version', `${process.version}`],
      ['ironfish in PATH', `${cmdInPath.toString()}`],
      ['Garbage Collector Exposed', `${String(!!global.gc)}`],
      ['Telemetry enabled', `${telemetryEnabled}`],
      ['Node name', `${nodeName}`],
      ['Block graffiti', `${blockGraffiti}`],
    ])
  }

  async outputRequiringDB(node: IronfishNode): Promise<Map<string, string>> {
    const accountsMeta = await node.accounts.db.loadAccountsMeta()
    const accountsHeadHash = accountsMeta.headHash !== null ? accountsMeta.headHash : ''

    const accountsBlockHeader = await node.chain.getHeader(Buffer.from(accountsHeadHash, 'hex'))
    const accountsHeadInChain = !!accountsBlockHeader
    const accountsHeadSequence = accountsBlockHeader?.sequence || 'null'

    return new Map<string, string>([
      ['Accounts head hash', `${accountsHeadHash}`],
      ['Accounts head in chain', `${accountsHeadInChain.toString()}`],
      ['Accounts head sequence', `${accountsHeadSequence}`],
    ])
  }

  display(output: Map<string, string>): void {
    // Get the longest key length to determine how big to make the space buffer
    let longestStringLength = 0
    for (const key of output.keys()) {
      if (key.length > longestStringLength) {
        longestStringLength = key.length
      }
    }

    const maxKeyWidth = longestStringLength + SPACE_BUFFER
    output.forEach((value, key) => {
      const spaceWidth = maxKeyWidth - key.length
      const spaceString = new Array(spaceWidth).join(' ')
      this.log(`${key}${spaceString}${value}`)
    })
  }
}
