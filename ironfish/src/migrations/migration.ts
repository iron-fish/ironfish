/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Config } from '../fileStores'
import { FileSystem } from '../fileSystems'
import { Logger } from '../logger'
import { IDatabase, IDatabaseTransaction } from '../storage'
import { Wallet } from '../wallet'

export enum Database {
  WALLET = 'wallet',
  BLOCKCHAIN = 'blockchain',
}

export type MigrationContext = {
  config: Config
  files: FileSystem
  wallet: Wallet
}

export abstract class Migration {
  id = 0
  name = ''
  abstract database: Database

  abstract path: string

  init(files: FileSystem): Migration {
    const ext = files.extname(this.path)
    const name = files.basename(this.path, ext)
    const parts = name.split('-')

    this.id = Number(parts[0])
    this.name = name

    return this
  }

  abstract prepare(context: MigrationContext): Promise<IDatabase> | IDatabase

  abstract forward(
    context: MigrationContext,
    db: IDatabase,
    tx: IDatabaseTransaction | undefined,
    logger: Logger,
    dryRun: boolean,
    walletPassphrase: string | undefined,
  ): Promise<void>

  abstract backward(
    context: MigrationContext,
    db: IDatabase,
    tx: IDatabaseTransaction | undefined,
    logger: Logger,
    dryRun: boolean,
    walletPassphrase: string | undefined,
  ): Promise<void>
}
