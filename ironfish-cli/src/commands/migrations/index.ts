/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { IronfishCommand } from '../../command'

export class StatusCommand extends IronfishCommand {
  static description = `list data migrations`

  async start(): Promise<void> {
    await this.parse(StatusCommand)

    const node = await this.sdk.node()
    await node.migrator.check()
  }
}
