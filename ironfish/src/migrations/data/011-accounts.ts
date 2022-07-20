/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { IronfishNode } from '../../node'
import { IDatabase } from '../../storage'
import { createDB } from '../../storage/utils'
import { Migration } from '../migration'

export default class Migration011 extends Migration {
  path = __filename

  async prepare(node: IronfishNode): Promise<IDatabase> {
    await node.files.mkdir(node.accounts.db.location, { recursive: true })
    return createDB({ location: node.accounts.db.location })
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async forward(): Promise<void> {}

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async backward(): Promise<void> {}
}
