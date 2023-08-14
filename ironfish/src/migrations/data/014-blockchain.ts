/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Assert } from '../../assert'
import { FullNode } from '../../node'
import { IDatabase } from '../../storage'
import { createDB } from '../../storage/utils'
import { IronfishNode } from '../../utils'
import { Database, Migration } from '../migration'

export class Migration014 extends Migration {
  path = __filename
  database = Database.BLOCKCHAIN

  async prepare(node: IronfishNode): Promise<IDatabase> {
    Assert.isInstanceOf(node, FullNode)
    await node.files.mkdir(node.chain.location, { recursive: true })
    return createDB({ location: node.chain.location })
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async forward(): Promise<void> {}

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async backward(): Promise<void> {}
}
