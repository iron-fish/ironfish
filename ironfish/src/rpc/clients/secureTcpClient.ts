/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import tls from 'tls'
import { Assert } from '../../assert'
import { IronfishTcpClient } from './tcpClient'

export class IronfishSecureTcpClient extends IronfishTcpClient {
  protected async connectClient(): Promise<void> {
    const connectPromise = super.connectClient()
    Assert.isNotNull(this.client)
    this.client = new tls.TLSSocket(this.client, { rejectUnauthorized: false })
    return connectPromise
  }
}
