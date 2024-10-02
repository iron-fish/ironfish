/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert, Logger, parseUrl } from '@ironfish/sdk'
import dns from 'dns'
import { MultisigClient, MultisigTcpClient, MultisigTlsClient } from './clients'

async function createClient(
  serverAddress: string,
  options: { tls: boolean; logger: Logger },
): Promise<MultisigClient> {
  const parsed = parseUrl(serverAddress)

  Assert.isNotNull(parsed.hostname)
  Assert.isNotNull(parsed.port)

  const resolved = await dns.promises.lookup(parsed.hostname)
  const host = resolved.address
  const port = parsed.port

  if (options.tls) {
    return new MultisigTlsClient({ host, port, logger: options.logger })
  } else {
    return new MultisigTcpClient({ host, port, logger: options.logger })
  }
}

export const MultisigBrokerUtils = {
  createClient,
}
