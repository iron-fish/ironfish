/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { IronfishNode } from '../node'
import { IDatabase, IDatabaseTransaction } from '../storage'

export abstract class Migration {
  id = 0
  abstract name: string

  init(): Migration {
    this.id = Number(this.name.split('-')[0])
    return this
  }

  abstract prepare(node: IronfishNode): Promise<IDatabase> | IDatabase
  abstract forward(node: IronfishNode, db: IDatabase, tx: IDatabaseTransaction): Promise<void>
  abstract backward(node: IronfishNode, db: IDatabase, tx: IDatabaseTransaction): Promise<void>
}
