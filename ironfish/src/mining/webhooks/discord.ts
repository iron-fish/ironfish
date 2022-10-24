/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ErrorUtils } from '../../utils'
import { WebhookNotifier } from './webhookNotifier'

export class Discord extends WebhookNotifier {
  sendText(text: string): void {
    if (!this.client || !this.webhook) {
      return
    }

    this.client.post(this.webhook, { content: text }).catch((e) => {
      this.logger.error(`Error sending discord message', ${ErrorUtils.renderError(e)}`)
    })
  }
}
