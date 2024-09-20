/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { MathUtils, TimeUtils } from '@ironfish/sdk'
import { IronfishCommand } from '../../command'
import { JsonFlags, RemoteFlags } from '../../flags'
import * as ui from '../../ui'

export class StatusCommand extends IronfishCommand {
  static description = `show wallet information`
  static enableJsonFlag = true

  static flags = {
    ...RemoteFlags,
    ...JsonFlags,
  }

  async start(): Promise<unknown> {
    await this.parse(StatusCommand)

    const client = await this.connectRpc()
    await ui.checkWalletUnlocked(client)

    const [nodeStatus, walletStatus] = await Promise.all([
      client.node.getStatus(),
      client.wallet.getAccounts(),
    ])

    const status: Record<string, unknown> = {
      Wallet: nodeStatus.content.accounts.enabled ? 'ENABLED' : 'DISABLED',
      Accounts: walletStatus.content.accounts.length,
      Head: nodeStatus.content.accounts.head.hash,
      Sequence: nodeStatus.content.accounts.head.sequence,
      Scanner: 'IDLE',
    }

    if (nodeStatus.content.accounts.scanning) {
      const progress = MathUtils.round(
        (nodeStatus.content.accounts.scanning.sequence /
          nodeStatus.content.accounts.scanning.endSequence) *
          100,
        2,
      )

      const duration = Date.now() - nodeStatus.content.accounts.scanning.startedAt
      const speed = MathUtils.round(nodeStatus.content.accounts.scanning.speed, 2)

      status['Scanner'] = 'SCANNING'
      status['Scan Progress'] = progress + '%'
      status['Scan Speed'] = `${speed} B/s`
      status['Scan Duration'] = TimeUtils.renderSpan(duration, {
        hideMilliseconds: true,
        forceSecond: true,
      })
      status[
        'Scan Block'
      ] = `${nodeStatus.content.accounts.scanning.sequence} -> ${nodeStatus.content.accounts.scanning.endSequence}`
    }

    this.log(ui.card(status))

    return {
      ...nodeStatus.content.accounts,
      accountsCount: walletStatus.content.accounts.length,
    }
  }
}
