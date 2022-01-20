/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NodeUtils, Package } from 'ironfish'
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

    // Note that this will return win32 for Windows even if on 64-bit
    // Full list: https://nodejs.org/api/process.html#process_process_platform
    const userOS = process.platform

    this.log(`
Ironfish version        ${Package.version} @ ${Package.git}
Operating System        ${userOS}
Node version            ${process.version}
Accounts head hash      ${accountsHeadHash}
Accounts head in chain  ${accountsHeadInChain.toString()}
Accounts head sequence  ${accountsHeadSequence}
    `)
  }
}
