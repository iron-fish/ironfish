/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { FileSystem } from '../fileSystems'
import { Logger } from '../logger'
import { IDatabase, IDatabaseTransaction } from '../storage'
import { Node } from '../utils'

export enum Database {
  WALLET = 'wallet',
  BLOCKCHAIN = 'blockchain',
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

  abstract prepare(node: Node): Promise<IDatabase> | IDatabase

  abstract forward(
    node: Node,
    db: IDatabase,
    tx: IDatabaseTransaction | undefined,
    logger: Logger,
    dryRun: boolean,
  ): Promise<void>

  abstract backward(
    node: Node,
    db: IDatabase,
    tx: IDatabaseTransaction | undefined,
    logger: Logger,
    dryRun: boolean,
  ): Promise<void>
}
