/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { IronfishCommand } from '../../../command'
import { JsonFlags, RemoteFlags } from '../../../flags'
import { LedgerSingleSigner } from '../../../ledger'
import * as ui from '../../../ui'

export class AddressCommand extends IronfishCommand {
  static description = `verify the ledger device's public address`

  static flags = {
    ...RemoteFlags,
    ...JsonFlags,
  }

  async start(): Promise<void> {
    const ledger = new LedgerSingleSigner()

    const address = await ui.ledger({
      ledger,
      message: 'Retrieve Wallet Address',
      approval: true,
      action: () => ledger.getPublicAddress(true),
    })

    this.log(ui.card({ Address: address }))
  }
}
