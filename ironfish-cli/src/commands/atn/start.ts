/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createSimulatorLogger } from '../../automated-test-network/logger'
import { simulation1 } from '../../automated-test-network/user-simulations/send'
import { IronfishCommand } from '../../command'

export default class Start extends IronfishCommand {
  static description = 'Start the test network'

  async start(): Promise<void> {
    await this.sdk.connectRpc()
    const logger = createSimulatorLogger()

    await simulation1(logger)
  }
}
