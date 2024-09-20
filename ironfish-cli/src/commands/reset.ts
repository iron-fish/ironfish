/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { FullNode, PEER_STORE_FILE_NAME } from '@ironfish/sdk'
import { Flags, ux } from '@oclif/core'
import fsAsync from 'fs/promises'
import { IronfishCommand } from '../command'
import { confirmOrQuit } from '../ui'

export default class Reset extends IronfishCommand {
  static description = 'reset the node database'

  static flags = {
    networkId: Flags.integer({
      char: 'i',
      default: undefined,
      description: 'Network ID of an official Iron Fish network to connect to',
    }),
    confirm: Flags.boolean({
      default: false,
      description: 'Confirm without asking',
    }),
  }

  node: FullNode | null = null

  async start(): Promise<void> {
    const { flags } = await this.parse(Reset)

    const chainDatabasePath = this.sdk.config.chainDatabasePath
    const hostFilePath: string = this.sdk.config.files.join(
      this.sdk.config.dataDir,
      PEER_STORE_FILE_NAME,
    )

    const existingId = this.sdk.internal.get('networkId')

    let networkIdMessage = ''
    if (flags.networkId != null && flags.networkId !== existingId) {
      networkIdMessage = `\n\nThe network ID will be changed from ${existingId} to the new value of ${flags.networkId}`
    } else {
      networkIdMessage = `\n\nThe network ID will stay unchanged as ${existingId}`
    }

    const message =
      'You are about to destroy your local copy of the blockchain. The following directories and files will be deleted:\n' +
      `\nBlockchain: ${chainDatabasePath}` +
      `\nHosts: ${hostFilePath}` +
      '\nYour wallet, accounts, and keys will NOT be deleted.' +
      networkIdMessage +
      `\n\nAre you sure?`

    await confirmOrQuit(message, flags.confirm)

    ux.action.start('Deleting databases...')

    await Promise.all([
      fsAsync.rm(chainDatabasePath, { recursive: true, force: true }),
      fsAsync.rm(hostFilePath, { recursive: true, force: true }),
    ])

    let networkChanged = false
    if (flags.networkId != null && flags.networkId !== existingId) {
      this.sdk.internal.set('networkId', flags.networkId)
      networkChanged = true
    }
    this.sdk.internal.set('isFirstRun', true)
    await this.sdk.internal.save()

    const node = await this.sdk.node()
    await node.wallet.open()
    await node.wallet.reset({ resetCreatedAt: networkChanged })

    ux.action.stop('Databases deleted successfully')
  }
}
