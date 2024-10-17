/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ErrorUtils, Logger } from '@ironfish/sdk'
import { MultisigClient, MultisigTcpClient, MultisigTlsClient } from './clients'

const DEFAULT_MULTISIG_BROKER_HOSTNAME = 'multisig.ironfish.network'
const DEFAULT_MULTISIG_BROKER_PORT = 9035

function parseConnectionOptions(options: {
  connection?: string
  hostname?: string
  port?: number
  sessionId?: string
  passphrase?: string
  logger: Logger
}): {
  hostname: string
  port: number
  sessionId: string | undefined
  passphrase: string | undefined
} {
  let hostname
  let port
  let sessionId
  let passphrase
  if (options.connection) {
    try {
      const url = new URL(options.connection)
      if (url.host) {
        hostname = url.hostname
      }
      if (url.port) {
        port = Number(url.port)
      }
      if (url.username) {
        sessionId = url.username
      }
      if (url.password) {
        passphrase = decodeURI(url.password)
      }
    } catch (e) {
      if (e instanceof TypeError && e.message.includes('Invalid URL')) {
        options.logger.error(ErrorUtils.renderError(e))
      }
      throw e
    }
  }

  hostname = hostname ?? options.hostname ?? DEFAULT_MULTISIG_BROKER_HOSTNAME
  port = port ?? options.port ?? DEFAULT_MULTISIG_BROKER_PORT

  return {
    hostname,
    port,
    sessionId,
    passphrase,
  }
}

function createClient(
  hostname: string,
  port: number,
  options: { tls: boolean; logger: Logger },
): MultisigClient {
  if (options.tls) {
    return new MultisigTlsClient({
      hostname,
      port,
      logger: options.logger,
    })
  } else {
    return new MultisigTcpClient({
      hostname,
      port,
      logger: options.logger,
    })
  }
}

export const MultisigBrokerUtils = {
  parseConnectionOptions,
  createClient,
}
