/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createRootLogger, Logger } from '../../logger'
import { RpcSocketClient } from './socketClient'

export class RpcTcpClient extends RpcSocketClient {
  constructor(
    host: string,
    port: number,
    logger: Logger = createRootLogger(),
    authToken?: string,
  ) {
    super({ host, port }, logger.withTag('tcpclient'), authToken)
  }
}
